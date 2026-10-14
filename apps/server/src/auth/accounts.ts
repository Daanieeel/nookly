import type { Session, User } from "@nookly/shared/api";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { authAccount, authSession, authUser, shares } from "../db/schema.ts";
import { HttpError, notFound, unauthorized } from "../errors.ts";
import { type Auth, isPlaceholderEmail } from "./auth.ts";

/// Who a request is: the account and the session (one per signed in device).
export interface AccessClaims {
  userId: string;
  sessionId: string;
}

type UserRow = typeof authUser.$inferSelect;

export function toUser(row: UserRow): User {
  const email = isPlaceholderEmail(row.email) ? null : row.email;
  return {
    id: row.id,
    username: row.username ?? row.name,
    email,
    emailVerified: email !== null && row.emailVerified,
    createdAt: row.createdAt.toISOString(),
  };
}

/// What the API does with accounts beyond better-auth's own routes: who a token
/// belongs to, the account, its devices and deleting it.
export class AccountService {
  private readonly db: Database;
  private readonly auth: Auth;

  constructor(db: Database, auth: Auth) {
    this.db = db;
    this.auth = auth;
  }

  /// The account behind a bearer token, while its session is open.
  async authenticate(token: string): Promise<AccessClaims> {
    if (!token) throw unauthorized();
    const found = await this.auth.api
      .getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) })
      .catch(() => null);
    if (!found) throw unauthorized();
    return { userId: found.user.id, sessionId: found.session.id };
  }

  async fromHeaders(headers: Record<string, string | undefined>): Promise<AccessClaims> {
    const header = headers.authorization ?? "";
    return this.authenticate(header.startsWith("Bearer ") ? header.slice(7) : "");
  }

  async me(userId: string): Promise<User> {
    const [row] = await this.db.select().from(authUser).where(eq(authUser.id, userId));
    if (!row) throw unauthorized();
    return toUser(row);
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

  /// Removes the account and everything the server holds for it: sessions, sign in
  /// methods, synced data, files' records, conflicts and shares, both ways. The
  /// devices keep their own data.
  async deleteAccount(claims: AccessClaims, password: string) {
    const [credential] = await this.db
      .select({ password: authAccount.password })
      .from(authAccount)
      .where(and(eq(authAccount.userId, claims.userId), eq(authAccount.providerId, "credential")));
    const ok =
      credential?.password != null && (await Bun.password.verify(password, credential.password));
    // Not 401: that would read as "signed out" to the client.
    if (!ok) throw new HttpError(403, "wrong_password", "The password is wrong.");
    const [user] = await this.db.select().from(authUser).where(eq(authUser.id, claims.userId));
    await this.db.transaction(async (tx) => {
      if (user && !isPlaceholderEmail(user.email)) {
        await tx.delete(shares).where(eq(shares.recipientEmail, user.email));
      }
      await tx.delete(authUser).where(eq(authUser.id, claims.userId));
    });
  }
}
