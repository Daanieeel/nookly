import type { Recheck } from "@nookly/shared/api";
import { and, eq, gt } from "drizzle-orm";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { authAccount, authSession, authUser, authVerification } from "../db/schema.ts";
import { HttpError, badRequest, unauthorized } from "../errors.ts";
import type { Mailer } from "../mail/mailer.ts";
import { confirmationCodeEmail } from "../mail/templates.ts";
import { updateRequired, type AccessClaims } from "./accounts.ts";
import { CONFIRMED } from "./app-sign-in.ts";
import { CODE_MINUTES, type EmailCodes } from "./codes.ts";
import type { TwoFactorService } from "./two-factor.ts";

/// Changing how an account signs in takes more than a signed in device: the person confirms
/// it is them, with a way they sign in and the second step when the account has one. That
/// lasts ten minutes, and a sign in that just happened counts.
export const FRESH_MS = 10 * 60_000;

export class RecheckService {
  private readonly db: Database;
  private readonly config: Config;
  private readonly mailer: Mailer;
  private readonly twoFactor: TwoFactorService;
  private readonly codes: EmailCodes;

  constructor(
    db: Database,
    config: Config,
    mailer: Mailer,
    twoFactor: TwoFactorService,
    codes: EmailCodes,
  ) {
    this.db = db;
    this.config = config;
    this.mailer = mailer;
    this.twoFactor = twoFactor;
    this.codes = codes;
  }

  async isFresh(sessionId: string): Promise<boolean> {
    const [session] = await this.db
      .select({ createdAt: authSession.createdAt, reauthedAt: authSession.reauthedAt })
      .from(authSession)
      .where(eq(authSession.id, sessionId));
    if (!session) throw unauthorized();
    return Date.now() - (session.reauthedAt ?? session.createdAt).getTime() < FRESH_MS;
  }

  /// Refuses unless the person confirmed it is them a short while ago. An app that can't ask
  /// them to (`current` false) is told to update instead.
  async require(claims: AccessClaims, current = true): Promise<void> {
    if (await this.isFresh(claims.sessionId)) return;
    if (!current) throw updateRequired();
    throw new HttpError(403, "recheck_required", "Confirm it's you to continue.");
  }

  private async userRow(userId: string) {
    const [row] = await this.db.select().from(authUser).where(eq(authUser.id, userId));
    if (!row) throw unauthorized();
    return row;
  }

  private codeKey(claims: AccessClaims) {
    return `recheck:${claims.sessionId}`;
  }

  /// Emails the code that answers the second step, for an account with emailed codes.
  async sendCode(claims: AccessClaims): Promise<void> {
    const user = await this.userRow(claims.userId);
    if (!(await this.twoFactor.methodsOf(user.id)).includes("email")) {
      throw badRequest("not_enabled", "Emailed codes are not turned on.");
    }
    const code = await this.codes.issue(this.codeKey(claims), user.email);
    await this.mailer.send({
      to: user.email,
      ...confirmationCodeEmail(this.config.PUBLIC_URL.replace(/\/$/, ""), code, CODE_MINUTES),
    });
  }

  /// The password, or a confirmation made with a provider just before.
  private async firstStep(userId: string, password: string | undefined) {
    if (password !== undefined) {
      const [credential] = await this.db
        .select({ password: authAccount.password })
        .from(authAccount)
        .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")));
      const ok =
        credential?.password != null &&
        (await Bun.password.verify(password, credential.password).catch(() => false));
      if (!ok) throw new HttpError(403, "wrong_password", "The password is wrong.");
      return null;
    }
    const [confirmation] = await this.db
      .select({ id: authVerification.id })
      .from(authVerification)
      .where(
        and(
          eq(authVerification.identifier, CONFIRMED + userId),
          gt(authVerification.expiresAt, new Date()),
        ),
      );
    if (!confirmation) throw confirmationRequired();
    return confirmation.id;
  }

  private async secondStep(claims: AccessClaims, input: Recheck) {
    const user = await this.userRow(claims.userId);
    if (!user.twoFactorEnabled) return;
    if (!input.method || !input.code) {
      throw new HttpError(403, "second_step_required", "Enter a sign in code too.");
    }
    const methods = await this.twoFactor.methodsOf(user.id);
    const right =
      methods.includes(input.method) &&
      (input.method === "email"
        ? await this.codes.take(this.codeKey(claims), user.email, input.code)
        : await this.twoFactor.takeCode(user.id, input.method, input.code));
    if (!right) throw new HttpError(403, "invalid_code", "That code isn't right.");
  }

  async confirm(claims: AccessClaims, input: Recheck): Promise<void> {
    const confirmation = await this.firstStep(claims.userId, input.password);
    await this.secondStep(claims, input);
    if (confirmation !== null) {
      // Taking it is what makes it good once, even for two requests at the same time.
      const taken = await this.db
        .delete(authVerification)
        .where(eq(authVerification.id, confirmation))
        .returning({ id: authVerification.id });
      if (taken.length === 0) throw confirmationRequired();
    }
    await this.db
      .update(authSession)
      .set({ reauthedAt: new Date() })
      .where(eq(authSession.id, claims.sessionId));
  }
}

const confirmationRequired = () =>
  new HttpError(
    403,
    "confirmation_required",
    "Confirm with your password or a sign in provider first.",
  );
