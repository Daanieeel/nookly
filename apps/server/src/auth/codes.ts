import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.ts";
import { authVerification } from "../db/schema.ts";

/// Six digit codes we email ourselves: to confirm a new address, and for the second step of
/// a recheck. Kept hashed, good once, for ten minutes and a few tries.
export const CODE_MINUTES = 10;
const ATTEMPTS = 5;
const PREFIX = "email-code:";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

const storedSchema = z.object({
  hash: z.string(),
  /// The address the code was sent to: it confirms that one and no other.
  email: z.string(),
  attempts: z.number(),
});

function readStored(value: string) {
  try {
    const parsed = storedSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class EmailCodes {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /// A new code for `key`, replacing any earlier one.
  async issue(key: string, email: string): Promise<string> {
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    await this.db.delete(authVerification).where(eq(authVerification.identifier, PREFIX + key));
    await this.db.insert(authVerification).values({
      id: crypto.randomUUID(),
      identifier: PREFIX + key,
      value: JSON.stringify({ hash: digest(`${key}:${code}`), email, attempts: 0 }),
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    });
    return code;
  }

  /// Whether `code` is the one sent for `key` to `email`. A right one is used up.
  async take(key: string, email: string, code: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(authVerification)
      .where(
        and(
          eq(authVerification.identifier, PREFIX + key),
          gt(authVerification.expiresAt, new Date()),
        ),
      );
    const stored = row ? readStored(row.value) : null;
    if (!row || !stored || stored.attempts >= ATTEMPTS) return false;
    const given = Buffer.from(digest(`${key}:${code.trim()}`), "hex");
    if (stored.email !== email || !timingSafeEqual(given, Buffer.from(stored.hash, "hex"))) {
      await this.db
        .update(authVerification)
        .set({ value: JSON.stringify({ ...stored, attempts: stored.attempts + 1 }) })
        .where(eq(authVerification.id, row.id));
      return false;
    }
    const taken = await this.db
      .delete(authVerification)
      .where(eq(authVerification.id, row.id))
      .returning({ id: authVerification.id });
    return taken.length > 0;
  }
}
