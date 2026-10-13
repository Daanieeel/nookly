import type { DeviceInfo, Session, Tokens, User } from "@nookly/shared/api";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { emailTokens, refreshTokens, sessions, shares, users } from "../db/schema.ts";
import { HttpError, conflict, notFound, unauthorized } from "../errors.ts";
import type { Logger } from "../log.ts";
import type { Mailer } from "../mail/mailer.ts";
import { dummyHash, hashPassword, verifyPassword } from "./passwords.ts";
import { type AccessClaims, AccessTokens, hashToken, randomToken } from "./tokens.ts";

const DAY_MS = 86_400_000;
const VERIFY_TTL_MS = 2 * DAY_MS;
const RESET_TTL_MS = 60 * 60_000;
/// How often a session's last use is written, at most.
const TOUCH_INTERVAL_MS = 5 * 60_000;

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class AuthService {
  private readonly db: Database;
  private readonly config: Config;
  private readonly mailer: Mailer;
  private readonly log: Logger;
  readonly access: AccessTokens;

  constructor(db: Database, config: Config, mailer: Mailer, log: Logger) {
    this.db = db;
    this.config = config;
    this.mailer = mailer;
    this.log = log;
    this.access = new AccessTokens(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  }

  private link(path: string, token: string) {
    return `${this.config.PUBLIC_URL.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
  }

  private async issue(userId: string, device: DeviceInfo): Promise<Tokens> {
    const [session] = await this.db
      .insert(sessions)
      .values({ userId, deviceName: device.name, platform: device.platform })
      .returning({ id: sessions.id });
    return this.tokensFor(userId, session.id);
  }

  private async tokensFor(userId: string, sessionId: string): Promise<Tokens> {
    const refreshToken = randomToken();
    await this.db.insert(refreshTokens).values({
      sessionId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });
    return {
      accessToken: await this.access.sign({ userId, sessionId }),
      refreshToken,
      expiresIn: this.access.ttl,
      sessionId,
    };
  }

  private async sendVerification(user: UserRow) {
    const token = randomToken();
    await this.db.insert(emailTokens).values({
      userId: user.id,
      kind: "verify",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
    await this.mailer.send({
      to: user.email,
      subject: "Confirm your email for Nookly",
      text: `Confirm your email address to finish setting up sync:\n\n${this.link("/verify-email", token)}\n\nThe link works for two days. If you didn't sign up, ignore this email.`,
    });
  }

  async register(
    email: string,
    password: string,
    device: DeviceInfo,
  ): Promise<{ user: User; tokens: Tokens }> {
    const passwordHash = await hashPassword(password);
    const [row] = await this.db
      .insert(users)
      .values({ email, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!row) throw conflict("email_taken", "An account with this email exists. Sign in instead.");
    // An invite sent before the account existed now belongs to it.
    await this.db
      .update(shares)
      .set({ recipientId: row.id })
      .where(and(eq(shares.recipientEmail, email), isNull(shares.recipientId)));
    await this.sendVerification(row).catch((error: Error) =>
      this.log.error("couldn't send the verification email", { error: error.message }),
    );
    return { user: toUser(row), tokens: await this.issue(row.id, device) };
  }

  async signIn(
    email: string,
    password: string,
    device: DeviceInfo,
  ): Promise<{ user: User; tokens: Tokens }> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email));
    const ok = await verifyPassword(password, row?.passwordHash ?? (await dummyHash()));
    if (!row || !ok) throw unauthorized("The email or the password is wrong.");
    return { user: toUser(row), tokens: await this.issue(row.id, device) };
  }

  /// Hands out a new refresh token for a valid one. A token used a second time was
  /// copied: its session is revoked, which signs out every holder.
  async refresh(refreshToken: string): Promise<Tokens> {
    const tokenHash = hashToken(refreshToken);
    const outcome = await this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ token: refreshTokens, session: sessions })
        .from(refreshTokens)
        .innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId))
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .for("update");
      if (!found) return { kind: "invalid" as const };
      const { token, session } = found;
      if (token.usedAt) {
        // Committed on its own, so the revoke holds although the request fails.
        await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
        return { kind: "reused" as const, sessionId: session.id };
      }
      if (session.revokedAt || token.expiresAt.getTime() <= Date.now())
        return { kind: "invalid" as const };
      await tx
        .update(refreshTokens)
        .set({ usedAt: new Date() })
        .where(eq(refreshTokens.id, token.id));
      await tx.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, session.id));
      const next = randomToken();
      await tx.insert(refreshTokens).values({
        sessionId: session.id,
        tokenHash: hashToken(next),
        expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
      });
      const tokens: Tokens = {
        accessToken: await this.access.sign({ userId: session.userId, sessionId: session.id }),
        refreshToken: next,
        expiresIn: this.access.ttl,
        sessionId: session.id,
      };
      return { kind: "ok" as const, tokens };
    });
    if (outcome.kind === "reused")
      this.log.warn("refresh token reused; session revoked", { sessionId: outcome.sessionId });
    if (outcome.kind !== "ok") throw unauthorized();
    return outcome.tokens;
  }

  /// The account behind an access token, while its session is still open.
  async authenticate(accessToken: string): Promise<AccessClaims> {
    const claims = await this.access.verify(accessToken);
    if (!claims) throw unauthorized();
    const [session] = await this.db
      .select({
        revokedAt: sessions.revokedAt,
        lastUsedAt: sessions.lastUsedAt,
        userId: sessions.userId,
      })
      .from(sessions)
      .where(eq(sessions.id, claims.sessionId));
    if (!session || session.revokedAt || session.userId !== claims.userId) throw unauthorized();
    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db
        .update(sessions)
        .set({ lastUsedAt: new Date() })
        .where(eq(sessions.id, claims.sessionId));
    }
    return claims;
  }

  async signOut(claims: AccessClaims) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, claims.sessionId));
  }

  async me(userId: string): Promise<User> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!row) throw unauthorized();
    return toUser(row);
  }

  private async useEmailToken(kind: "verify" | "reset", token: string) {
    const [row] = await this.db
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailTokens.tokenHash, hashToken(token)),
          eq(emailTokens.kind, kind),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: emailTokens.userId });
    if (!row)
      throw new HttpError(400, "invalid_token", "This link has expired or was already used.");
    return row.userId;
  }

  async verifyEmail(token: string) {
    const userId = await this.useEmailToken("verify", token);
    await this.db
      .update(users)
      .set({ emailVerifiedAt: sql`COALESCE(${users.emailVerifiedAt}, now())` })
      .where(eq(users.id, userId));
  }

  async resendVerification(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    if (row && !row.emailVerifiedAt) await this.sendVerification(row);
  }

  /// Always looks the same from outside, so it can't tell which emails have accounts.
  async forgotPassword(email: string) {
    const [row] = await this.db.select().from(users).where(eq(users.email, email));
    if (!row) return;
    const token = randomToken();
    await this.db.insert(emailTokens).values({
      userId: row.id,
      kind: "reset",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await this.mailer.send({
      to: row.email,
      subject: "Reset your Nookly password",
      text: `Choose a new password here:\n\n${this.link("/reset-password", token)}\n\nThe link works for one hour. If you didn't ask for this, ignore this email; your password stays as it is.`,
    });
  }

  /// Sets a new password and signs out every device.
  async resetPassword(token: string, password: string) {
    const userId = await this.useEmailToken("reset", token);
    await this.db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        emailVerifiedAt: sql`COALESCE(${users.emailVerifiedAt}, now())`,
      })
      .where(eq(users.id, userId));
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async sessions(claims: AccessClaims): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, claims.userId), isNull(sessions.revokedAt)))
      .orderBy(sessions.lastUsedAt);
    return rows.reverse().map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === claims.sessionId,
    }));
  }

  async revokeSession(claims: AccessClaims, id: string) {
    const [row] = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(sessions.id, id), eq(sessions.userId, claims.userId), isNull(sessions.revokedAt)),
      )
      .returning({ id: sessions.id });
    if (!row) throw notFound("No such session.");
  }

  /// Removes the account and everything the server holds for it: sessions, synced
  /// data, conflicts and shares, both ways. The devices keep their own data.
  async deleteAccount(claims: AccessClaims, password: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, claims.userId));
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      throw unauthorized("The password is wrong.");
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(shares).where(eq(shares.recipientEmail, row.email));
      await tx.delete(users).where(eq(users.id, row.id));
    });
  }
}
