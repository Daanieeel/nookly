import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, like, lt } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { authAccount, authSession, authVerification } from "../db/schema.ts";
import { badRequest, forbidden } from "../errors.ts";
import { appReturnPage } from "../pages.ts";
import { type Auth, deviceOf, isBetaKey, socialProviders } from "./auth.ts";

/// Signing in from the apps with another account (Google, GitHub, Notion). The apps hold a
/// bearer token, never a cookie, so the browser leg hands the session over in two steps:
///
/// 1. `begin`: the app asks, gets the provider's address and a secret only it knows, and
///    opens the address in the browser. The server keeps a flow, keyed by a ticket.
/// 2. The browser signs in at the provider and lands on `/oauth/done` (`complete`), which
///    puts the session on the flow and sends the browser back to the app with the ticket
///    as a code.
/// 3. `redeem`: the app swaps the code and its secret for the session token, once.
///
/// A code seen by anything else (another app on a custom scheme, a browser history) opens
/// nothing without the secret, which never travelled through the browser.
const FLOW = "app-flow:";
/// A confirmation a person has made with their provider, kept for the one thing it was for.
export const CONFIRMED = "confirmed:";
/// How long a confirmation waits to be used.
export const CONFIRMED_MS = 5 * 60_000;
/// Long enough for a person to find their password at the provider.
const WAITING_MS = 10 * 60_000;
/// Once the browser has signed in, the app has this long to collect.
const READY_MS = 2 * 60_000;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
/// Cookies better-auth leaves in the browser, which belong to no one once the app has the session.
const BROWSER_COOKIES = ["session_token", "session_data", "dont_remember"].flatMap((name) => [
  `better-auth.${name}`,
  `__Secure-better-auth.${name}`,
]);

const randomSecret = () => randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest();

const flowSchema = z.object({
  /// SHA-256 of the app's secret, hex.
  secret: z.string(),
  /// The session, once the browser has signed in.
  token: z.string().nullable(),
  /// The account a flow that only confirms is for: no session is handed over, the person
  /// signs in at the provider again to show it is them.
  confirm: z.string().nullable().default(null),
  /// The browser has signed in to that account.
  confirmed: z.boolean().default(false),
});
type Flow = z.infer<typeof flowSchema>;

/// A flow as it was stored; null when what is there is not one.
function readFlow(value: string): Flow | null {
  try {
    const parsed = flowSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface BeginInput {
  provider: string;
  /// The loopback port a desktop listens on for the browser's return; a phone has none.
  port?: number;
  betaKey?: string;
  createAccount?: boolean;
}

/// The address the browser goes back to: a desktop's loopback port, or the phone's scheme.
function returnTo(port: string | undefined): string | null {
  if (port === undefined) return "nookly://auth";
  if (!/^\d{4,5}$/.test(port)) return null;
  const number = Number(port);
  return number >= 1024 && number <= 65_535 ? `http://127.0.0.1:${number}/auth` : null;
}

export class AppSignIn {
  private readonly db: Database;
  private readonly auth: Auth;
  private readonly config: Config;

  constructor(db: Database, auth: Auth, config: Config) {
    this.db = db;
    this.auth = auth;
    this.config = config;
  }

  async begin(input: BeginInput, headers: Headers): Promise<{ url: string; secret: string }> {
    if (!(input.provider in socialProviders(this.config))) {
      throw badRequest("unknown_provider", "That way of signing in isn't offered here.");
    }
    // The closed beta: no key, no new account, however the account is made.
    if (input.createAccount && this.config.BETA_KEY) {
      const given = (input.betaKey ?? "").trim();
      if (!given) throw forbidden("Enter the beta key to create an account.");
      if (!isBetaKey(this.config.BETA_KEY, given)) throw forbidden("That beta key isn't right.");
    }
    return this.start(
      input.provider,
      input.port,
      { token: null, confirm: null, confirmed: false },
      input.createAccount === true,
      headers,
    );
  }

  /// Starts a sign in at the provider that only confirms the signed in account is its
  /// person's, before something that cannot be undone. The provider must be one the account
  /// signs in with.
  async beginConfirmation(
    userId: string,
    input: { provider: string; port?: number },
    headers: Headers,
  ): Promise<{ url: string; secret: string }> {
    if (!(input.provider in socialProviders(this.config))) {
      throw badRequest("unknown_provider", "That way of signing in isn't offered here.");
    }
    const [linked] = await this.db
      .select({ id: authAccount.id })
      .from(authAccount)
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, input.provider)));
    if (!linked) throw badRequest("unknown_provider", "This account doesn't sign in that way.");
    return this.start(
      input.provider,
      input.port,
      { token: null, confirm: userId, confirmed: false },
      false,
      headers,
    );
  }

  private async start(
    provider: string,
    port: number | undefined,
    flow: Omit<Flow, "secret">,
    createAccount: boolean,
    headers: Headers,
  ): Promise<{ url: string; secret: string }> {
    const ticket = randomSecret();
    const secret = randomSecret();
    await this.db.insert(authVerification).values({
      id: crypto.randomUUID(),
      identifier: FLOW + ticket,
      value: JSON.stringify({ ...flow, secret: digest(secret).toString("hex") }),
      expiresAt: new Date(Date.now() + WAITING_MS),
    });
    const back = `/oauth/done?t=${ticket}${port ? `&p=${port}` : ""}`;
    const started = await this.auth.api.signInSocial({
      body: {
        provider,
        callbackURL: back,
        newUserCallbackURL: back,
        errorCallbackURL: back,
        requestSignUp: createAccount ? true : undefined,
        disableRedirect: true,
      },
      headers,
    });
    if (!started.url) throw badRequest("no_url", "The provider didn't answer. Try again.");
    return { url: started.url, secret };
  }

  /// The page the browser lands on after the provider: sends it back to the app.
  async complete(
    query: { t?: string; p?: string; error?: string },
    headers: Headers,
  ): Promise<{ status: number; html: string; clearCookies: boolean }> {
    const broken = (message: string) => ({
      status: 400,
      html: appReturnPage("This link doesn't work", message, null),
      clearCookies: false,
    });
    const base = returnTo(query.p);
    if (!base || !query.t || !TICKET.test(query.t)) {
      return broken("Go back to Nookly and start the sign in again.");
    }
    const ticket = query.t;
    const [row] = await this.db
      .select()
      .from(authVerification)
      .where(eq(authVerification.identifier, FLOW + ticket));
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return broken("The sign in took too long. Go back to Nookly and try again.");
    }
    if (query.error !== undefined) {
      await this.db.delete(authVerification).where(eq(authVerification.id, row.id));
      const code = /^[a-z0-9_]{1,60}$/.test(query.error) ? query.error : "unknown";
      return {
        status: 200,
        html: appReturnPage(
          "Couldn't sign in",
          "Go back to Nookly to see why.",
          `${base}?error=${code}`,
        ),
        clearCookies: true,
      };
    }
    const session = await this.auth.api.getSession({ headers }).catch(() => null);
    if (!session) return broken("The browser isn't signed in. Go back to Nookly and try again.");
    const flow = readFlow(row.value);
    if (!flow) return broken("This link doesn't work. Go back to Nookly and try again.");
    if (flow.confirm !== null) {
      // The browser's own session was only the provider's proof: it is not kept.
      await this.db.delete(authSession).where(eq(authSession.token, session.session.token));
      if (session.user.id !== flow.confirm) {
        await this.db.delete(authVerification).where(eq(authVerification.id, row.id));
        return {
          status: 400,
          html: appReturnPage(
            "That's a different account",
            "Go back to Nookly and sign in with the account you are using there.",
            null,
          ),
          clearCookies: true,
        };
      }
      await this.db
        .update(authVerification)
        .set({
          value: JSON.stringify({ ...flow, confirmed: true }),
          expiresAt: new Date(Date.now() + READY_MS),
        })
        .where(eq(authVerification.id, row.id));
      return {
        status: 200,
        html: appReturnPage("You're confirmed", "Going back to Nookly.", `${base}?code=${ticket}`),
        clearCookies: true,
      };
    }
    await this.db
      .update(authVerification)
      .set({
        value: JSON.stringify({ ...flow, token: session.session.token }),
        expiresAt: new Date(Date.now() + READY_MS),
      })
      .where(eq(authVerification.id, row.id));
    return {
      status: 200,
      html: appReturnPage("You're signed in", "Going back to Nookly.", `${base}?code=${ticket}`),
      clearCookies: true,
    };
  }

  /// Swaps a code and its secret for the session token. Works once.
  async redeem(code: string, secret: string, headers: Headers): Promise<{ token: string }> {
    await this.db
      .delete(authVerification)
      .where(
        and(
          like(authVerification.identifier, `${FLOW}%`),
          lt(authVerification.expiresAt, new Date()),
        ),
      );
    const refused = () => badRequest("invalid_code", "The sign in expired. Try again.");
    if (!TICKET.test(code)) throw refused();
    const [row] = await this.db
      .select()
      .from(authVerification)
      .where(eq(authVerification.identifier, FLOW + code));
    if (!row || row.expiresAt.getTime() < Date.now()) throw refused();
    const flow = readFlow(row.value);
    if (!flow?.token || flow.confirm !== null) throw refused();
    const given = digest(secret);
    const stored = Buffer.from(flow.secret, "hex");
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) throw refused();
    // Taking the row is what makes the code work once, even for two requests at the same time.
    const taken = await this.db
      .delete(authVerification)
      .where(eq(authVerification.id, row.id))
      .returning({ id: authVerification.id });
    if (taken.length === 0) throw refused();
    await this.db
      .update(authSession)
      .set(deviceOf(headers))
      .where(eq(authSession.token, flow.token));
    return { token: flow.token };
  }

  /// Swaps a code and its secret for the confirmation of the account that began it. Works once,
  /// and only for that account; what it allows is taken by `AccountService.deleteAccount`.
  async redeemConfirmation(userId: string, code: string, secret: string): Promise<void> {
    const refused = () => badRequest("invalid_code", "The confirmation expired. Try again.");
    if (!TICKET.test(code)) throw refused();
    const [row] = await this.db
      .select()
      .from(authVerification)
      .where(eq(authVerification.identifier, FLOW + code));
    if (!row || row.expiresAt.getTime() < Date.now()) throw refused();
    const flow = readFlow(row.value);
    if (!flow?.confirmed || flow.confirm !== userId) throw refused();
    const given = digest(secret);
    const stored = Buffer.from(flow.secret, "hex");
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) throw refused();
    const taken = await this.db
      .delete(authVerification)
      .where(eq(authVerification.id, row.id))
      .returning({ id: authVerification.id });
    if (taken.length === 0) throw refused();
    await this.db
      .delete(authVerification)
      .where(eq(authVerification.identifier, CONFIRMED + userId));
    await this.db.insert(authVerification).values({
      id: crypto.randomUUID(),
      identifier: CONFIRMED + userId,
      value: "1",
      expiresAt: new Date(Date.now() + CONFIRMED_MS),
    });
  }

  /// Headers that remove the browser's own copy of the session.
  static clearCookies(secure: boolean): string[] {
    return BROWSER_COOKIES.map(
      (name) => `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    );
  }
}
