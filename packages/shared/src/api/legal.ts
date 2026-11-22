import { asksForBetaKey } from "./server-address.ts";

/// The terms and the privacy policy people agree to when they make an account on Nookly's
/// own sync server. The version is the date of the terms (`apps/web/src/content/legal.ts`,
/// `UPDATED`; a test there keeps the two equal). Change it only when the terms change in a
/// way people have to agree to again: every account is asked once more, and sync waits on
/// each device until they have.
export const TERMS_VERSION = "2026-11-22";

export type LegalPage = "terms" | "privacy" | "imprint" | "license";

const SITE = "https://nookly.work";

const PATHS = {
  en: { terms: "/terms", privacy: "/privacy", imprint: "/imprint", license: "/license" },
  de: {
    terms: "/de/agb",
    privacy: "/de/datenschutz",
    imprint: "/de/impressum",
    license: "/de/lizenz",
  },
} satisfies Record<"en" | "de", Record<LegalPage, string>>;

/// The website's page for a device's language: German where the device speaks German (the
/// binding text), English otherwise.
export function legalUrl(page: LegalPage, locale: string): string {
  const language = locale.toLowerCase().startsWith("de") ? "de" : "en";
  return `${SITE}${PATHS[language][page]}`;
}

/// The device's language, for `legalUrl`.
export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "en";
  }
}

/// Only Nookly's own server has these terms; a server someone runs themselves has its own
/// rules, and none of this applies to it.
export function requiresTerms(serverUrl: string): boolean {
  return asksForBetaKey(serverUrl);
}
