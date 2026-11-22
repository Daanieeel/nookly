import type { Metadata } from "next";
import { SITE_URL } from "./site";

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export type Page = "home" | "download" | "status" | "imprint" | "privacy" | "terms" | "license";

/// English sits at the root, German under `/de`, each with the page names its readers
/// expect (Impressum, Datenschutz).
const PATHS = {
  en: {
    home: "/",
    download: "/download",
    status: "/status",
    imprint: "/imprint",
    privacy: "/privacy",
    terms: "/terms",
    license: "/license",
  },
  de: {
    home: "/de",
    download: "/de/download",
    status: "/de/status",
    imprint: "/de/impressum",
    privacy: "/de/datenschutz",
    terms: "/de/agb",
    license: "/de/lizenz",
  },
} satisfies Record<Locale, Record<Page, string>>;

export function pathFor(locale: Locale, page: Page): string {
  return PATHS[locale][page];
}

/// A page's title, description, canonical link and its other language, for search engines
/// and link previews.
export function pageMetadata(
  locale: Locale,
  page: Page,
  { title, description }: { title: string; description: string },
): Metadata {
  const url = `${SITE_URL}${pathFor(locale, page)}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}${pathFor("en", page)}`,
        de: `${SITE_URL}${pathFor("de", page)}`,
        "x-default": `${SITE_URL}${pathFor("en", page)}`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Nookly",
      locale: locale === "de" ? "de_DE" : "en_US",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
