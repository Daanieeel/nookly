import { generateRandomString, makeSignature } from "better-auth/crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { authVerification } from "../db/schema.ts";
import { type Auth, TWO_FACTOR_SECONDS } from "./auth.ts";

/// A half finished sign in. Better-auth's two-factor plugin makes one for a password sign
/// in only, so a provider sign in makes the same thing here, and the plugin's own routes
/// finish either: an identifier it keeps the account under, a count of tries, and the
/// signed cookie value that names it.
const PROVIDER = "challenge-provider:";

/// The identifier inside a challenge.
export const challengeIdentifier = (challenge: string) =>
  decodeURIComponent(challenge).split(".")[0] ?? "";

export async function createChallenge(
  db: Database,
  auth: Auth,
  userId: string,
  provider: string,
): Promise<string> {
  const identifier = `2fa-${generateRandomString(20)}`;
  const expiresAt = new Date(Date.now() + TWO_FACTOR_SECONDS * 1000);
  await db.insert(authVerification).values(
    [
      [identifier, userId],
      [`2fa-attempts-${identifier}`, "0"],
      [PROVIDER + identifier, provider],
    ].map(([key, value]) => ({
      id: crypto.randomUUID(),
      identifier: key ?? "",
      value: value ?? "",
      expiresAt,
    })),
  );
  const { secret } = await auth.$context;
  return encodeURIComponent(`${identifier}.${await makeSignature(identifier, secret)}`);
}

/// The sign in method a challenge came from: the one recorded for it, else the password.
export async function challengeProvider(db: Database, challenge: string): Promise<string> {
  const [row] = await db
    .select({ provider: authVerification.value })
    .from(authVerification)
    .where(
      and(
        eq(authVerification.identifier, PROVIDER + challengeIdentifier(challenge)),
        gt(authVerification.expiresAt, new Date()),
      ),
    );
  return row?.provider ?? "credential";
}
