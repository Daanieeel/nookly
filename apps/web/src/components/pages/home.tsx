import type { Locale } from "@/lib/i18n";
import { dictionary } from "@/content";
import { latestRelease } from "@/lib/releases";
import { GITHUB_URL, SITE_URL } from "@/lib/site";
import { Hero } from "../hero/hero";
import {
  Agents,
  Closing,
  Faq,
  FaqJsonLd,
  Features,
  Intro,
  Keyboard,
  Privacy,
  Sync,
} from "../home/sections";
import { SiteShell } from "../site-shell";

export async function HomePage({ locale }: { locale: Locale }) {
  const release = await latestRelease();
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nookly",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "macOS, Windows, Linux",
    description: dictionary(locale).meta.homeDescription,
    url: SITE_URL,
    downloadUrl: `${SITE_URL}/download`,
    ...(release.version ? { softwareVersion: release.version } : {}),
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    sameAs: GITHUB_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };
  return (
    <SiteShell locale={locale} page="home">
      <Hero locale={locale} />
      <Intro locale={locale} />
      <Features locale={locale} />
      <Keyboard locale={locale} />
      <Agents locale={locale} />
      <Sync locale={locale} />
      <Privacy locale={locale} />
      <Faq locale={locale} />
      <Closing locale={locale} />
      <script
        type="application/ld+json"
        // oxlint-disable-next-line react/no-danger -- our own static data, serialised
        dangerouslySetInnerHTML={{ __html: JSON.stringify(app) }}
      />
      <FaqJsonLd locale={locale} />
    </SiteShell>
  );
}
