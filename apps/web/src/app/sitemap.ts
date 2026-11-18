import type { MetadataRoute } from "next";
import { LOCALES, type Page, pathFor } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const PAGES: Page[] = ["home", "download", "status", "imprint", "privacy", "terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((page) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}${pathFor(locale, page)}`,
      changeFrequency: page === "status" ? ("always" as const) : ("weekly" as const),
      priority: page === "home" ? 1 : page === "download" ? 0.8 : 0.3,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${pathFor(l, page)}`])),
      },
    })),
  );
}
