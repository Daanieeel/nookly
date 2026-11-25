import {
  NOOKLY_SIGN_IN,
  type SignInMethod,
  type SignInSummary,
  newPasswordSchema,
} from "./schemas.ts";
import { providerName } from "./provider-sign-in.ts";

/// What both apps say and offer about how an account signs in.

/// Every way to sign in a person can see: Nookly Signin first, then the providers the server
/// offers, then any the account still has that it doesn't.
export function signInProviders(summary: SignInSummary): string[] {
  const connected = summary.methods.map((method) => method.provider);
  return [...new Set([NOOKLY_SIGN_IN, ...summary.offered, ...connected])];
}

/// The line under a way of signing in; `undefined` is one that isn't connected.
export function signInDetail(method: SignInMethod | undefined): string {
  if (!method) return "Not connected";
  if (!method.email) return "No email shared";
  return method.emailVerified ? method.email : `${method.email}, not confirmed`;
}

export type SignInActionId = "primary" | "email" | "password" | "disconnect";

/// What can be done with a connected way of signing in.
export function signInActions(method: SignInMethod): { id: SignInActionId; label: string }[] {
  const own = method.provider === NOOKLY_SIGN_IN;
  const actions: { id: SignInActionId; label: string; offered: boolean }[] = [
    { id: "primary", label: "Make Primary", offered: method.canBePrimary },
    { id: "email", label: "Change Email", offered: own || method.primary },
    { id: "password", label: "Change Password", offered: own },
    { id: "disconnect", label: "Disconnect", offered: !method.primary },
  ];
  return actions.filter((action) => action.offered).map(({ id, label }) => ({ id, label }));
}

/// What confirms it is the person: the account's password where it has one, or any provider
/// connected to it.
export function recheckWays(summary: SignInSummary): { password: boolean; providers: string[] } {
  const connected = summary.methods.map((method) => method.provider);
  return {
    password: connected.includes(NOOKLY_SIGN_IN),
    providers: connected.filter((provider) => provider !== NOOKLY_SIGN_IN),
  };
}

/// A new password typed twice: the password when both entries are right, otherwise what is
/// wrong with each.
export function checkNewPassword(next: string, confirm: string) {
  const parsed = newPasswordSchema.safeParse({ next, confirm });
  const problem = (field: "next" | "confirm") =>
    parsed.error?.issues.find((issue) => issue.path[0] === field)?.message;
  const problems: { next?: string; confirm?: string } = parsed.success
    ? {}
    : { next: problem("next"), confirm: problem("confirm") };
  return { password: parsed.success ? parsed.data.next : null, problems };
}

export const SIGN_IN_METHODS_NOTE =
  "Any of them signs you in. Notices and sign in codes go to the primary one's email.";

export const RECHECK_COPY = {
  title: "Confirm it's you",
  text: "Changing how you sign in needs this.",
};

export const EMAIL_CHANGE_COPY = {
  add: {
    title: `Add ${providerName(NOOKLY_SIGN_IN)}`,
    text: "An email and a password that sign you in to this account.",
  },
  change: {
    title: "Change Email",
    text: "The new address is confirmed with a code we send to it.",
  },
};

export const codeSentText = (email: string) =>
  `We sent a code to ${email}. It works for 10 minutes.`;
