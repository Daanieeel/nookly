import { randomInt } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import type { SecuritySummary, TwoFactorMethod } from "@nookly/shared/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { authAccount, authTwoFactor, authUser, authVerification, users } from "../db/schema.ts";
import { HttpError, badRequest, conflict, forbidden, unauthorized } from "../errors.ts";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "../security/disposable-email.ts";
import { type Auth, isPlaceholderEmail } from "./auth.ts";

/// The second step of signing in with a password, for the accounts that have one: a code
/// emailed to the account, a code from an authenticator app, and recovery codes for a lost
/// phone. Better-auth's two-factor plugin runs the sign in half (it holds the half finished
/// sign in, counts attempts and locks an account that is being guessed at); this is the setup
/// half, written here because the plugin's own setup swaps the session under the app, and the
/// apps keep one token.
export const ISSUER = "Nookly";
const CODES = 10;
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const randomText = (length: number) =>
  Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/// Ten recovery codes, written `abcde-fghij` like better-auth's own.
const newCodes = () =>
  Array.from({ length: CODES }, () => {
    const code = randomText(10);
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });

const codesSchema = z.array(z.string());

export class TwoFactorService {
  private readonly db: Database;
  private readonly auth: Auth;
  private readonly required: boolean;
  private readonly blockDisposable: boolean;

  constructor(db: Database, auth: Auth, config: Config) {
    this.db = db;
    this.auth = auth;
    this.required = config.REQUIRE_TWO_FACTOR;
    this.blockDisposable = config.BLOCK_DISPOSABLE_EMAIL;
  }

  private async key() {
    return (await this.auth.$context).secretConfig;
  }

  private async seal(data: string) {
    return symmetricEncrypt({ key: await this.key(), data });
  }

  private async unseal(data: string) {
    return symmetricDecrypt({ key: await this.key(), data });
  }

  private async unsealCodes(data: string): Promise<string[]> {
    try {
      const parsed = codesSchema.safeParse(JSON.parse(await this.unseal(data)));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  private async userRow(userId: string) {
    const [row] = await this.db.select().from(authUser).where(eq(authUser.id, userId));
    if (!row) throw unauthorized();
    return row;
  }

  /// Whether the account signs in with a password, the only kind two-factor is for.
  async hasPassword(userId: string): Promise<boolean> {
    const [credential] = await this.db
      .select({ password: authAccount.password })
      .from(authAccount)
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")));
    return credential?.password != null;
  }

  /// Asks for the password again before anything that weakens or changes the account's
  /// protection, and refuses an account that has none: another provider protects those.
  private async checkPassword(userId: string, password: string) {
    const [credential] = await this.db
      .select({ password: authAccount.password })
      .from(authAccount)
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")));
    if (credential?.password == null) {
      throw forbidden("Two-factor is for accounts that sign in with a password.");
    }
    const ok = await Bun.password.verify(password, credential.password).catch(() => false);
    if (!ok) throw new HttpError(403, "wrong_password", "The password is wrong.");
  }

  private async authenticatorRow(userId: string) {
    const [row] = await this.db
      .select()
      .from(authTwoFactor)
      .where(eq(authTwoFactor.userId, userId));
    return row;
  }

  async summary(userId: string): Promise<SecuritySummary> {
    const row = await this.userRow(userId);
    const available = await this.hasPassword(userId);
    const address = isPlaceholderEmail(row.email) ? null : row.email;
    const authenticator = await this.authenticatorRow(userId);
    const authenticatorOn = authenticator?.verified === true;
    return {
      available,
      required: this.required && available,
      enabled: row.twoFactorEnabled,
      email: {
        enabled: row.twoFactorEmail,
        possible: address !== null && row.emailVerified,
        address,
        confirmed: address !== null && row.emailVerified,
      },
      authenticator: { enabled: authenticatorOn },
      backupCodesLeft: authenticator
        ? (await this.unsealCodes(authenticator.backupCodes)).length
        : 0,
    };
  }

  /// What can answer a half finished sign in, from its challenge: the value better-auth keeps
  /// the account under. Authenticator first, then email, and recovery codes with the app.
  async methodsFor(challenge: string): Promise<TwoFactorMethod[]> {
    const identifier = decodeURIComponent(challenge).split(".")[0] ?? "";
    const [pending] = await this.db
      .select({ userId: authVerification.value })
      .from(authVerification)
      .where(eq(authVerification.identifier, identifier));
    if (!pending) return [];
    const summary = await this.summary(pending.userId).catch(() => null);
    if (!summary) return [];
    const methods: TwoFactorMethod[] = [];
    if (summary.authenticator.enabled) methods.push("totp");
    if (summary.email.enabled && summary.email.possible) methods.push("email");
    if (summary.backupCodesLeft > 0) methods.push("backup");
    return methods;
  }

  /// Gives an account made without an email one. It is not confirmed until the link in the
  /// mail it is sent is opened, and codes are only ever emailed to a confirmed address.
  async addEmail(userId: string, address: string): Promise<void> {
    const email = address.trim().toLowerCase();
    if (this.blockDisposable && isDisposableEmail(email)) {
      throw badRequest("email_disposable", DISPOSABLE_EMAIL_MESSAGE);
    }
    const row = await this.userRow(userId);
    if (!isPlaceholderEmail(row.email)) {
      throw conflict("email_set", "This account already has an email address.");
    }
    const [taken] = await this.db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, email));
    if (taken) throw conflict("email_taken", "That email address belongs to another account.");
    await this.db.transaction(async (tx) => {
      await tx.update(authUser).set({ email, emailVerified: false }).where(eq(authUser.id, userId));
      await tx.update(users).set({ email }).where(eq(users.id, userId));
    });
    await this.auth.api.sendVerificationEmail({ body: { email, callbackURL: "/verified" } });
  }

  /// Turns on emailed codes. Only for a confirmed address, so a code never goes to one that
  /// someone else typed in.
  async enableEmail(userId: string, password: string): Promise<SecuritySummary> {
    await this.checkPassword(userId, password);
    const row = await this.userRow(userId);
    if (isPlaceholderEmail(row.email) || !row.emailVerified) {
      throw badRequest("email_unconfirmed", "Emailed codes need a confirmed email address.");
    }
    await this.db
      .update(authUser)
      .set({ twoFactorEmail: true, twoFactorEnabled: true })
      .where(eq(authUser.id, userId));
    return this.summary(userId);
  }

  /// Begins adding an authenticator app: a secret, kept but not yet trusted.
  async startAuthenticator(userId: string, password: string) {
    await this.checkPassword(userId, password);
    const existing = await this.authenticatorRow(userId);
    if (existing?.verified === true) {
      throw conflict("authenticator_set", "An authenticator app is already set up.");
    }
    const row = await this.userRow(userId);
    const secret = randomText(32);
    const values = { secret: await this.seal(secret), verified: false };
    if (existing) {
      // Recovery codes made before the app stay as they are.
      await this.db.update(authTwoFactor).set(values).where(eq(authTwoFactor.id, existing.id));
    } else {
      await this.db.insert(authTwoFactor).values({
        id: crypto.randomUUID(),
        userId,
        ...values,
        backupCodes: await this.seal("[]"),
      });
    }
    const label = isPlaceholderEmail(row.email) ? (row.username ?? row.name) : row.email;
    const uri = createOTP(secret, { digits: 6, period: 30 }).url(ISSUER, label);
    const key = new URL(uri).searchParams.get("secret") ?? "";
    return { uri, key };
  }

  /// A code from the new app proves it works: it is switched on, and the recovery codes are
  /// made (shown once, kept encrypted).
  async confirmAuthenticator(userId: string, code: string): Promise<string[]> {
    const row = await this.authenticatorRow(userId);
    if (!row || row.verified) {
      throw badRequest("no_setup", "Start adding an authenticator app first.");
    }
    const secret = await this.unseal(row.secret);
    const ok = await createOTP(secret, { digits: 6, period: 30 }).verify(code.trim());
    if (!ok) {
      throw badRequest(
        "invalid_code",
        "That code isn't right. Check the time on your phone and try again.",
      );
    }
    // Recovery codes already given stay good; only an account with none gets them now.
    const kept = await this.unsealCodes(row.backupCodes);
    const codes = kept.length > 0 ? [] : newCodes();
    const sealed = codes.length > 0 ? await this.seal(JSON.stringify(codes)) : row.backupCodes;
    await this.db.transaction(async (tx) => {
      await tx
        .update(authTwoFactor)
        .set({ verified: true, backupCodes: sealed })
        .where(eq(authTwoFactor.id, row.id));
      await tx.update(authUser).set({ twoFactorEnabled: true }).where(eq(authUser.id, userId));
    });
    return codes;
  }

  /// Makes recovery codes, replacing any; the old ones stop working. For an account with any
  /// method on: they open it when that method is lost.
  async newBackupCodes(userId: string, password: string): Promise<string[]> {
    await this.checkPassword(userId, password);
    if (!(await this.userRow(userId)).twoFactorEnabled) {
      throw badRequest("no_method", "Recovery codes need a second step turned on first.");
    }
    const row = await this.authenticatorRow(userId);
    const codes = newCodes();
    const sealed = await this.seal(JSON.stringify(codes));
    if (row) {
      await this.db
        .update(authTwoFactor)
        .set({ backupCodes: sealed })
        .where(eq(authTwoFactor.id, row.id));
    } else {
      // No authenticator app: the row only holds the codes, with a secret nobody knows.
      await this.db.insert(authTwoFactor).values({
        id: crypto.randomUUID(),
        userId,
        secret: await this.seal(randomText(32)),
        backupCodes: sealed,
        verified: false,
      });
    }
    return codes;
  }

  /// Turns a method off. Where the server requires two-factor the last one stays.
  async disable(
    userId: string,
    method: "email" | "totp",
    password: string,
  ): Promise<SecuritySummary> {
    await this.checkPassword(userId, password);
    const before = await this.summary(userId);
    const on = method === "email" ? before.email.enabled : before.authenticator.enabled;
    if (!on) throw badRequest("not_enabled", "That method is not turned on.");
    const emailLeft = method === "email" ? false : before.email.enabled;
    const appLeft = method === "totp" ? false : before.authenticator.enabled;
    if (this.required && !emailLeft && !appLeft) {
      throw forbidden(
        "Two-factor is required on this server. Add another method before turning this one off.",
      );
    }
    await this.db.transaction(async (tx) => {
      if (!emailLeft && !appLeft) {
        // Nothing left to recover: the recovery codes go too.
        await tx.delete(authTwoFactor).where(eq(authTwoFactor.userId, userId));
      } else if (method === "totp") {
        // The app goes, the recovery codes stay: its secret is replaced by one nobody knows.
        await tx
          .update(authTwoFactor)
          .set({ verified: false, secret: await this.seal(randomText(32)) })
          .where(eq(authTwoFactor.userId, userId));
      }
      await tx
        .update(authUser)
        .set({
          twoFactorEmail: emailLeft,
          twoFactorEnabled: emailLeft || appLeft,
        })
        .where(eq(authUser.id, userId));
    });
    return this.summary(userId);
  }
}
