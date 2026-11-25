import { NOOKLY_SIGN_IN } from "./schemas.ts";

/// Signing in with another account: the providers Nookly knows by name, and what people
/// read when the provider or the server turns a sign in down.

export const PROVIDER_NAMES = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  notion: "Notion",
} as const;

/// An email and a password is Nookly's own way to sign in.
const NAMES = new Map<string, string>([
  ...Object.entries(PROVIDER_NAMES),
  [NOOKLY_SIGN_IN, "Nookly Signin"],
]);

export const providerName = (provider: string): string => NAMES.get(provider) ?? provider;

/// The reason in the address the browser came back with, in words. Better-auth's codes for a
/// sign in that was refused, and our own for one that took too long.
export function providerErrorMessage(code: string, provider: string): string {
  const name = providerName(provider);
  switch (code) {
    case "signup_disabled":
      return `There is no Nookly account for this ${name} account yet. Create one on the I'm new here tab first.`;
    case "account_not_linked":
      return `An account with this email already exists. Sign in the way you did before, then connect ${name} in Settings.`;
    case "access_denied":
      return `${name} didn't allow the sign in.`;
    case "email_not_found":
      return `${name} didn't share an email address, which Nookly needs to find your account.`;
    case "expired":
      return "The sign in took too long. Try again.";
    default:
      return `Signing in with ${name} didn't work. Try again.`;
  }
}

/// A sign in with a provider that found no Nookly account for it: the app can offer to make
/// one instead of only showing the message.
export class ProviderNoAccountError extends Error {
  constructor(provider: string) {
    super(providerErrorMessage("signup_disabled", provider));
    this.name = "ProviderNoAccountError";
  }
}
