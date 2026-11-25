import { NOOKLY_SIGN_IN, type SignInChange, type SignInSummary } from "@nookly/shared/api";
import { and, asc, eq } from "drizzle-orm";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { authAccount, authSession, authUser } from "../db/schema.ts";
import { HttpError, badRequest, conflict, notFound, unauthorized } from "../errors.ts";
import type { Mailer } from "../mail/mailer.ts";
import { confirmationCodeEmail } from "../mail/templates.ts";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "../security/disposable-email.ts";
import type { AccessClaims } from "./accounts.ts";
import { socialProviders } from "./auth.ts";
import { CODE_MINUTES, type EmailCodes } from "./codes.ts";
import { emailTaken, isPlaceholderEmail, realEmail, setAccountEmail } from "./emails.ts";
import type { RecheckService } from "./recheck.ts";
import type { TwoFactorService } from "./two-factor.ts";

/// The ways an account signs in: Nookly Signin (an email and a password) and providers, one
/// of each. One is primary: its email is the account's. Every change here needs a recheck
/// (the routes ask for it).
type Method = typeof authAccount.$inferSelect;

/// Apple's private relay addresses are Apple's to set.
const APPLE_RELAY = "@privaterelay.appleid.com";

const emailTakenError = () =>
  conflict("email_taken", "That email address belongs to another account.");

export class SignInMethods {
  private readonly db: Database;
  private readonly config: Config;
  private readonly mailer: Mailer;
  private readonly recheck: RecheckService;
  private readonly twoFactor: TwoFactorService;
  private readonly codes: EmailCodes;

  constructor(deps: {
    db: Database;
    config: Config;
    mailer: Mailer;
    recheck: RecheckService;
    twoFactor: TwoFactorService;
    codes: EmailCodes;
  }) {
    this.db = deps.db;
    this.config = deps.config;
    this.mailer = deps.mailer;
    this.recheck = deps.recheck;
    this.twoFactor = deps.twoFactor;
    this.codes = deps.codes;
  }

  private async account(userId: string) {
    const [user] = await this.db.select().from(authUser).where(eq(authUser.id, userId));
    if (!user) throw unauthorized();
    const methods = await this.db
      .select()
      .from(authAccount)
      .where(eq(authAccount.userId, userId))
      .orderBy(asc(authAccount.createdAt), asc(authAccount.id));
    // An account is never without one; the earliest stands in where none is recorded.
    const primary = user.primaryProvider ?? methods[0]?.providerId ?? null;
    return { user, methods, primary };
  }

  private async method(userId: string, provider: string) {
    const account = await this.account(userId);
    const method = account.methods.find((m) => m.providerId === provider);
    if (!method) throw notFound("This account doesn't sign in that way.");
    return { ...account, method };
  }

  async summary(claims: AccessClaims): Promise<SignInSummary> {
    const { methods, primary } = await this.account(claims.userId);
    const [session] = await this.db
      .select({ provider: authSession.provider })
      .from(authSession)
      .where(eq(authSession.id, claims.sessionId));
    return {
      methods: methods.map((m) => ({
        provider: m.providerId,
        email: m.email,
        emailVerified: m.email !== null && m.emailVerified,
        primary: m.providerId === primary,
        canBePrimary: m.providerId !== primary && m.email !== null && m.emailVerified,
      })),
      current: session?.provider ?? null,
      fresh: await this.recheck.isFresh(claims.sessionId),
      secondStep: await this.twoFactor.methodsOf(claims.userId),
      offered: Object.keys(socialProviders(this.config)),
    };
  }

  private async changed(claims: AccessClaims, signedOut = false): Promise<SignInChange> {
    if (!signedOut) return { ...(await this.summary(claims)), signedOut };
    return { methods: [], current: null, fresh: false, secondStep: [], offered: [], signedOut };
  }

  /// Removes a way of signing in, with its stored provider tokens, and the sessions that
  /// came through it.
  async unlink(
    claims: AccessClaims,
    provider: string,
  ): Promise<{ change: SignInChange; ended: string[] }> {
    const { method, methods, primary } = await this.method(claims.userId, provider);
    if (provider === primary || methods.length < 2) {
      throw conflict(
        "primary_method",
        "The primary way of signing in stays. Make another one primary first.",
      );
    }
    const ended = await this.db.transaction(async (tx) => {
      await tx.delete(authAccount).where(eq(authAccount.id, method.id));
      return tx
        .delete(authSession)
        .where(and(eq(authSession.userId, claims.userId), eq(authSession.provider, provider)))
        .returning({ id: authSession.id });
    });
    const ids = ended.map((s) => s.id);
    return { change: await this.changed(claims, ids.includes(claims.sessionId)), ended: ids };
  }

  private async makePrimary(userId: string, method: Method) {
    const email = method.email;
    if (email !== null && (await emailTaken(this.db, email, userId))) throw emailTakenError();
    await setAccountEmail(this.db, userId, email, method.emailVerified, method.providerId);
  }

  async setPrimary(claims: AccessClaims, provider: string): Promise<SignInChange> {
    const { method, methods, primary } = await this.method(claims.userId, provider);
    if (provider !== primary) {
      if (methods.length > 1 && !(method.email !== null && method.emailVerified)) {
        throw badRequest(
          "email_unconfirmed",
          "Only a way of signing in with a confirmed email can be primary.",
        );
      }
      await this.makePrimary(claims.userId, method);
    }
    return this.changed(claims);
  }

  /// A primary without a confirmed email can only stay while it is the only way in: once
  /// there is one with a confirmed address, that one takes over.
  async settlePrimary(userId: string): Promise<void> {
    const { methods, primary } = await this.account(userId);
    const confirmed = (m: Method) => m.email !== null && m.emailVerified;
    const current = methods.find((m) => m.providerId === primary);
    if (current && confirmed(current)) return;
    for (const method of methods.filter(confirmed)) {
      if (method.email !== null && !(await emailTaken(this.db, method.email, userId))) {
        await this.makePrimary(userId, method);
        return;
      }
    }
  }

  private codeKey(userId: string, provider: string) {
    return `address:${userId}:${provider}`;
  }

  /// Which addresses may be given to `provider`: Nookly Signin's own (added with it), or the
  /// primary's.
  private async checkNewEmail(userId: string, provider: string, email: string) {
    if (provider !== NOOKLY_SIGN_IN) {
      const { method, primary } = await this.method(userId, provider);
      if (provider !== primary) {
        throw badRequest("not_primary", "Make it primary to change its email.");
      }
      if (provider === "apple" && method.email?.endsWith(APPLE_RELAY)) {
        throw badRequest("relay_email", "Apple manages this address.");
      }
    }
    if (isPlaceholderEmail(email)) throw badRequest("invalid_email", "Use your own email address.");
    if (this.config.BLOCK_DISPOSABLE_EMAIL && isDisposableEmail(email)) {
      throw badRequest("email_disposable", DISPOSABLE_EMAIL_MESSAGE);
    }
    if (await emailTaken(this.db, email, userId)) throw emailTakenError();
  }

  async sendEmailCode(claims: AccessClaims, provider: string, email: string): Promise<void> {
    await this.checkNewEmail(claims.userId, provider, email);
    const code = await this.codes.issue(this.codeKey(claims.userId, provider), email);
    await this.mailer.send({
      to: email,
      ...confirmationCodeEmail(this.config.PUBLIC_URL.replace(/\/$/, ""), code, CODE_MINUTES),
    });
  }

  private async takeEmailCode(userId: string, provider: string, email: string, code: string) {
    if (!(await this.codes.take(this.codeKey(userId, provider), email, code))) {
      throw new HttpError(
        400,
        "invalid_code",
        "That code isn't right, or it has run out. Send a new one.",
      );
    }
  }

  async changeEmail(
    claims: AccessClaims,
    input: { provider: string; email: string; code: string },
  ): Promise<SignInChange> {
    const { provider, email, code } = input;
    const { method, primary } = await this.method(claims.userId, provider);
    await this.checkNewEmail(claims.userId, provider, email);
    await this.takeEmailCode(claims.userId, provider, email, code);
    if (provider === primary) await setAccountEmail(this.db, claims.userId, email, true);
    await this.db
      .update(authAccount)
      .set({ email, emailVerified: true, emailChosen: true, updatedAt: new Date() })
      .where(eq(authAccount.id, method.id));
    await this.settlePrimary(claims.userId);
    return this.changed(claims);
  }

  private hash(password: string) {
    return Bun.password.hash(password, { algorithm: "argon2id" });
  }

  async addPassword(
    claims: AccessClaims,
    input: { email: string; code: string; password: string },
  ): Promise<SignInChange> {
    const { methods } = await this.account(claims.userId);
    if (methods.some((m) => m.providerId === NOOKLY_SIGN_IN)) {
      throw conflict("already_linked", "This account already has Nookly Signin.");
    }
    await this.checkNewEmail(claims.userId, NOOKLY_SIGN_IN, input.email);
    await this.takeEmailCode(claims.userId, NOOKLY_SIGN_IN, input.email, input.code);
    await this.db.insert(authAccount).values({
      id: crypto.randomUUID(),
      userId: claims.userId,
      providerId: NOOKLY_SIGN_IN,
      accountId: claims.userId,
      password: await this.hash(input.password),
      email: realEmail(input.email),
      emailVerified: true,
      emailChosen: true,
    });
    await this.settlePrimary(claims.userId);
    return this.changed(claims);
  }

  async setPassword(claims: AccessClaims, password: string): Promise<SignInChange> {
    const { method } = await this.method(claims.userId, NOOKLY_SIGN_IN);
    await this.db
      .update(authAccount)
      .set({ password: await this.hash(password), updatedAt: new Date() })
      .where(eq(authAccount.id, method.id));
    return this.changed(claims);
  }
}
