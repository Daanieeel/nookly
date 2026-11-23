import type { Session, User } from "@nookly/shared/api";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.ts";
import { authAccount, authSession, authUser, authVerification, shares } from "../db/schema.ts";
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from "../errors.ts";
import type { BlobStore } from "../storage/blobs.ts";
import { CONFIRMED } from "./app-sign-in.ts";
import { type Auth, isPlaceholderEmail } from "./auth.ts";

/// Who a request is: the account and the session (one per signed in device).
export interface AccessClaims {
  userId: string;
  sessionId: string;
}

type UserRow = typeof authUser.$inferSelect;

export function toUser(
  row: UserRow,
  extra: {
    needsUsername?: boolean;
    twoFactorRequired?: boolean;
    hasPassword?: boolean;
    providers?: string[];
  } = {},
): User {
  const email = isPlaceholderEmail(row.email) ? null : row.email;
  return {
    id: row.id,
    username: row.username ?? row.name,
    email,
    emailVerified: email !== null && row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    termsVersion: row.termsVersion,
    needsUsername: extra.needsUsername ?? false,
    twoFactorRequired: extra.twoFactorRequired ?? false,
    hasPassword: extra.hasPassword,
    providers: extra.providers,
  };
}

/// What a failed query reports: the driver's error, which may be wrapped once.
const driverError = z.object({
  code: z.string().optional(),
  cause: z.object({ code: z.string().optional() }).optional(),
});

/// What a username may be: the same as the sign up form takes.
const USERNAME = /^[A-Za-z0-9_.]{3,30}$/;

/// What the API does with accounts beyond better-auth's own routes: who a token
/// belongs to, the account, its devices and deleting it.
export class AccountService {
  private readonly db: Database;
  private readonly auth: Auth;
  private readonly storage: BlobStore | null;
  /// When each session was last written as used, so a busy device writes once a minute.
  private readonly touched = new Map<string, number>();

  private readonly touchEveryMs: number;

  /// Accounts with a password must have two-factor before anything else works.
  private readonly requireTwoFactor: boolean;

  constructor(
    db: Database,
    auth: Auth,
    storage: BlobStore | null,
    touchEveryMs = 60_000,
    requireTwoFactor = false,
  ) {
    this.touchEveryMs = touchEveryMs;
    this.requireTwoFactor = requireTwoFactor;
    this.db = db;
    this.auth = auth;
    this.storage = storage;
  }

  /// The account behind a bearer token, while its session is open. Where two-factor is
  /// required, an account with a password that has not set it up gets in only for what
  /// `setup` allows: seeing itself and setting it up, or leaving.
  async authenticate(token: string, setup = false): Promise<AccessClaims> {
    if (!token) throw unauthorized();
    const found = await this.auth.api
      .getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) })
      .catch(() => null);
    if (!found) throw unauthorized();
    if (this.requireTwoFactor && !setup && !found.user.twoFactorEnabled) {
      const [credential] = await this.db
        .select({ password: authAccount.password })
        .from(authAccount)
        .where(
          and(eq(authAccount.userId, found.user.id), eq(authAccount.providerId, "credential")),
        );
      if (credential?.password != null) {
        throw new HttpError(
          403,
          "two_factor_required",
          "Set up two-factor authentication to continue.",
        );
      }
    }
    await this.touch(found.session.id);
    return { userId: found.user.id, sessionId: found.session.id };
  }

  /// Notes that a session was just used, for "last active" in the devices list. Better-auth
  /// renews a session once a day, which made a device in use show as idle for hours. Only
  /// the time is written here; the session's expiry stays better-auth's to renew.
  private async touch(sessionId: string) {
    const now = Date.now();
    if (now - (this.touched.get(sessionId) ?? 0) < this.touchEveryMs) return;
    if (this.touched.size > 5_000) {
      for (const [id, at] of this.touched)
        if (now - at >= this.touchEveryMs) this.touched.delete(id);
    }
    this.touched.set(sessionId, now);
    await this.db
      .update(authSession)
      .set({ updatedAt: new Date(now) })
      .where(eq(authSession.id, sessionId))
      .catch(() => {});
  }

  async fromHeaders(
    headers: Record<string, string | undefined>,
    setup = false,
  ): Promise<AccessClaims> {
    const header = headers.authorization ?? "";
    return this.authenticate(header.startsWith("Bearer ") ? header.slice(7) : "", setup);
  }

  /// What a session's device calls itself.
  async deviceOf(sessionId: string): Promise<{ name: string; platform: string }> {
    const [row] = await this.db
      .select({ name: authSession.deviceName, platform: authSession.platform })
      .from(authSession)
      .where(eq(authSession.id, sessionId));
    return { name: row?.name ?? "Unnamed device", platform: row?.platform ?? "other" };
  }

  /// What an account needs from its person next: a username (made with another provider), or
  /// two-factor (a password, on a server that requires it).
  private async userOf(row: UserRow): Promise<User> {
    const accounts = await this.db
      .select({ providerId: authAccount.providerId, password: authAccount.password })
      .from(authAccount)
      .where(eq(authAccount.userId, row.id));
    const needsUsername =
      row.username === null && accounts.some((account) => account.providerId !== "credential");
    const hasPassword = accounts.some(
      (account) => account.providerId === "credential" && account.password != null,
    );
    return toUser(row, {
      needsUsername,
      twoFactorRequired: this.requireTwoFactor && hasPassword && !row.twoFactorEnabled,
      hasPassword,
      providers: accounts.map((a) => a.providerId).filter((id) => id !== "credential"),
    });
  }

  async me(userId: string): Promise<User> {
    const [row] = await this.db.select().from(authUser).where(eq(authUser.id, userId));
    if (!row) throw unauthorized();
    return this.userOf(row);
  }

  /// The username of an account made with a provider, picked once.
  async setUsername(userId: string, username: string): Promise<User> {
    const name = username.trim();
    if (!USERNAME.test(name)) {
      throw badRequest("invalid_username", "Use 3 to 30 letters, numbers, dots or underscores.");
    }
    const [row] = await this.db.select().from(authUser).where(eq(authUser.id, userId));
    if (!row) throw unauthorized();
    if (!(await this.userOf(row)).needsUsername) {
      throw forbidden("Your username is already set.");
    }
    const taken = () => conflict("username_taken", "That username is taken. Try another one.");
    const [other] = await this.db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.username, name.toLowerCase()));
    if (other) throw taken();
    try {
      const [updated] = await this.db
        .update(authUser)
        .set({ username: name.toLowerCase(), displayUsername: name })
        .where(eq(authUser.id, userId))
        .returning();
      if (!updated) throw unauthorized();
      return toUser(updated);
    } catch (error) {
      // Two accounts picking the same name at once: the second one loses.
      const failure = driverError.safeParse(error);
      const code = failure.success ? (failure.data.cause?.code ?? failure.data.code) : undefined;
      if (code === "23505") throw taken();
      throw error;
    }
  }

  /// Records that the account agreed to this version of the terms.
  async acceptTerms(userId: string, version: string): Promise<User> {
    const [row] = await this.db
      .update(authUser)
      .set({ termsVersion: version, termsAcceptedAt: new Date() })
      .where(eq(authUser.id, userId))
      .returning();
    if (!row) throw unauthorized();
    return this.userOf(row);
  }

  async sessions(claims: AccessClaims): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(authSession)
      .where(and(eq(authSession.userId, claims.userId), gt(authSession.expiresAt, new Date())))
      .orderBy(desc(authSession.updatedAt), desc(authSession.createdAt));
    return rows.map((s) => ({
      id: s.id,
      deviceName: s.deviceName ?? "Unnamed device",
      platform: s.platform ?? "other",
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.updatedAt.toISOString(),
      current: s.id === claims.sessionId,
    }));
  }

  async revokeSession(claims: AccessClaims, id: string) {
    const [row] = await this.db
      .delete(authSession)
      .where(and(eq(authSession.id, id), eq(authSession.userId, claims.userId)))
      .returning({ id: authSession.id });
    if (!row) throw notFound("No such session.");
  }

  async signOut(claims: AccessClaims) {
    await this.db.delete(authSession).where(eq(authSession.id, claims.sessionId));
  }

  /// Uses up the confirmation an account made with its provider, when it has one that is
  /// still good.
  private async takeConfirmation(userId: string): Promise<boolean> {
    const taken = await this.db
      .delete(authVerification)
      .where(
        and(
          eq(authVerification.identifier, CONFIRMED + userId),
          gt(authVerification.expiresAt, new Date()),
        ),
      )
      .returning({ id: authVerification.id });
    return taken.length > 0;
  }

  /// Removes the account and everything the server holds for it: sessions, sign in
  /// methods, synced data, files' records, conflicts and shares, both ways. The
  /// devices keep their own data.
  async deleteAccount(claims: AccessClaims, password?: string) {
    const [credential] = await this.db
      .select({ password: authAccount.password })
      .from(authAccount)
      .where(and(eq(authAccount.userId, claims.userId), eq(authAccount.providerId, "credential")));
    if (credential?.password != null) {
      const ok = password != null && (await Bun.password.verify(password, credential.password));
      // Not 401: that would read as "signed out" to the client.
      if (!ok) throw new HttpError(403, "wrong_password", "The password is wrong.");
    } else if (!(await this.takeConfirmation(claims.userId))) {
      // An account made with another provider has no password: its provider has to vouch that
      // the person deleting it is the one who signs in with it, shortly before.
      throw new HttpError(
        403,
        "confirmation_required",
        "Confirm with your sign in provider before deleting the account.",
      );
    }
    const [user] = await this.db.select().from(authUser).where(eq(authUser.id, claims.userId));
    // Files first: if storage fails the account stays, and deleting can be tried again.
    await this.storage?.deleteOwner(claims.userId);
    await this.db.transaction(async (tx) => {
      if (user && !isPlaceholderEmail(user.email)) {
        await tx.delete(shares).where(eq(shares.recipientEmail, user.email));
      }
      await tx.delete(authUser).where(eq(authUser.id, claims.userId));
    });
  }
}
