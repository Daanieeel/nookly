import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { authAccount, authUser, shares, users } from "../db/schema.ts";

/// Where an account's addresses live. An account has one per sign in method
/// (`auth_account.email`), and the primary method's is the account's own, kept in
/// `auth_user.email` and `users.email`.

/// The domain of the email an account made without one gets. `.invalid` can never
/// be delivered to, and the API shows such an address as no email at all.
export const PLACEHOLDER_EMAIL_DOMAIN = "users.nookly.invalid";
export const isPlaceholderEmail = (email: string) =>
  email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
export const placeholderEmail = (name: string) => `${name}@${PLACEHOLDER_EMAIL_DOMAIN}`;

/// An address as stored for a sign in method: null for none and for a placeholder.
export const realEmail = (email: string | null | undefined) =>
  email && !isPlaceholderEmail(email) ? email.toLowerCase() : null;

/// Whether another account uses the address, as its own or for one of its sign in methods.
export async function emailTaken(db: Database, email: string, userId?: string): Promise<boolean> {
  const address = email.toLowerCase();
  const [account] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(
      and(sql`lower(${authUser.email}) = ${address}`, userId ? ne(authUser.id, userId) : undefined),
    )
    .limit(1);
  if (account) return true;
  const [method] = await db
    .select({ id: authAccount.id })
    .from(authAccount)
    .where(
      and(
        sql`lower(${authAccount.email}) = ${address}`,
        userId ? ne(authAccount.userId, userId) : undefined,
      ),
    )
    .limit(1);
  return method !== undefined;
}

/// Invites sent to the address before it was confirmed now belong to the account; never
/// before, so nobody can claim invites to an address they don't hold.
export async function claimInvites(db: Database, userId: string, email: string) {
  await db
    .update(shares)
    .set({ recipientId: userId })
    .where(and(eq(shares.recipientEmail, email.toLowerCase()), isNull(shares.recipientId)));
}

/// Makes `email` the account's own, in both places it is kept, together. `provider` also
/// makes that sign in method the primary one. A null address changes only the primary.
export async function setAccountEmail(
  db: Database,
  userId: string,
  email: string | null,
  verified: boolean,
  provider?: string,
) {
  // Drizzle leaves an undefined column as it is.
  const changes = {
    email: email ?? undefined,
    emailVerified: email === null ? undefined : verified,
    primaryProvider: provider,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.update(authUser).set(changes).where(eq(authUser.id, userId));
    if (email !== null) await tx.update(users).set({ email }).where(eq(users.id, userId));
  });
  if (email !== null && verified) await claimInvites(db, userId, email);
}

/// Sign in with `email` and a password: better-auth knows an account by one address only, so
/// the one it knows is what it is asked for. An address that is the account's but no longer
/// its password sign in's answers like one nobody has.
export async function loginAddress(db: Database, email: string): Promise<string> {
  const address = email.trim().toLowerCase();
  const [own] = await db
    .select({ email: authUser.email })
    .from(authAccount)
    .innerJoin(authUser, eq(authUser.id, authAccount.userId))
    .where(
      and(eq(authAccount.providerId, "credential"), sql`lower(${authAccount.email}) = ${address}`),
    );
  if (own) return own.email;
  const [moved] = await db
    .select({ id: authAccount.id })
    .from(authUser)
    .innerJoin(
      authAccount,
      and(eq(authAccount.userId, authUser.id), eq(authAccount.providerId, "credential")),
    )
    .where(and(sql`lower(${authUser.email}) = ${address}`, sql`${authAccount.email} IS NOT NULL`));
  return moved ? placeholderEmail(`unknown-${crypto.randomUUID()}`) : address;
}
