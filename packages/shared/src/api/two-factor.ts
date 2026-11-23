import type { ApiClient } from "./client.ts";
import type { TwoFactorMethod } from "./schemas.ts";

const ORDER: TwoFactorMethod[] = ["totp", "email", "backup"];

/// The method a sign in offers first: the authenticator app, then an emailed code, and a
/// recovery code when nothing else is left.
export function firstTwoFactorMethod(methods: TwoFactorMethod[]): TwoFactorMethod {
  return ORDER.find((method) => methods.includes(method)) ?? "backup";
}

/// A code as the server wants it: the digits of an app or emailed code with whatever
/// separates them taken out, a recovery code in the case it was made in.
export function cleanTwoFactorCode(method: TwoFactorMethod, text: string): string {
  if (method === "backup") return text.trim().toLowerCase();
  return text.replace(/\D/g, "");
}

/// What a person sees for each method: the field's label, the way to switch to it, and a
/// line that says where the code comes from.
export const twoFactorMethodLabels = {
  totp: {
    code: "Authenticator code",
    switchTo: "Use your authenticator app",
    hint: "Open your authenticator app and type the 6 digit code for Nookly.",
  },
  email: {
    code: "Emailed code",
    switchTo: "Email me a code",
    hint: "We emailed a code to the address of your account. It works for 5 minutes.",
  },
  backup: {
    code: "Recovery code",
    switchTo: "Use a recovery code",
    hint: "Type one of the recovery codes you saved. Each one works once.",
  },
} satisfies Record<TwoFactorMethod, { code: string; switchTo: string; hint: string }>;

/// What a password unlocks in an account's security: each one changes how it signs in.
export type SecurityAction =
  | "emailOn"
  | "emailOff"
  | "authenticatorOn"
  | "authenticatorOff"
  | "newCodes";

/// What each asks the person, as the step that wants the password says it.
export const SECURITY_STEPS = {
  emailOn: {
    title: "Turn on emailed codes",
    text: "Enter your password. Nookly then emails a code to your address each time you sign in.",
  },
  emailOff: {
    title: "Turn off emailed codes",
    text: "Enter your password to stop signing in with emailed codes.",
  },
  authenticatorOn: {
    title: "Add an authenticator app",
    text: "Enter your password, then scan a code with an app like 1Password, Authy or Google Authenticator.",
  },
  authenticatorOff: {
    title: "Remove the authenticator app",
    text: "Enter your password to stop signing in with the authenticator app.",
  },
  newCodes: {
    title: "Get new recovery codes",
    text: "Enter your password. Your old recovery codes stop working.",
  },
} satisfies Record<SecurityAction, { title: string; text: string }>;

/// Where the person goes next: back to the overview, to scan a new authenticator's key, or
/// to the recovery codes that were just made, which are shown once.
export type SecurityOutcome =
  | { name: "overview" }
  | { name: "scan"; uri: string; key: string }
  | { name: "codes"; codes: string[] };

type SecurityApi = Pick<
  ApiClient,
  "enableEmailTwoFactor" | "disableTwoFactor" | "startAuthenticator" | "newBackupCodes"
>;

export async function runSecurityAction(
  api: SecurityApi,
  action: SecurityAction,
  password: string,
): Promise<SecurityOutcome> {
  switch (action) {
    case "emailOn":
      await api.enableEmailTwoFactor(password);
      return { name: "overview" };
    case "emailOff":
      await api.disableTwoFactor("email", password);
      return { name: "overview" };
    case "authenticatorOff":
      await api.disableTwoFactor("totp", password);
      return { name: "overview" };
    case "authenticatorOn":
      return { name: "scan", ...(await api.startAuthenticator(password)) };
    case "newCodes":
      return { name: "codes", codes: await api.newBackupCodes(password) };
  }
}
