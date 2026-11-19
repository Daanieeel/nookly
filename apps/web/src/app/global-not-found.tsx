import type { Metadata } from "next";
import { Button } from "@nookly/ui/components/button";
import { RootLayout } from "@/components/root-layout";
import { SiteShell } from "@/components/site-shell";
import { Hearth } from "@/components/hero/hearth";
import { dictionary } from "@/content";
import { pathFor } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: dictionary("en").notFound.title,
  robots: { index: false },
};

/// Any address the site does not know. English, with a way home in German too.
export default function GlobalNotFound() {
  const en = dictionary("en").notFound;
  const de = dictionary("de").notFound;
  return (
    <RootLayout locale="en">
      <SiteShell locale="en" page="home">
        <section className="relative overflow-hidden bg-background pt-24 sm:pt-32">
          <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center px-4 text-center">
            <p className="font-mono text-sm text-muted-foreground">404</p>
            <h1 className="mt-3 font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold">
              {en.title}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">{en.body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild className="h-10 px-5">
                <a href={pathFor("en", "home")}>{en.home}</a>
              </Button>
              <Button asChild variant="secondary" className="h-10 px-5">
                <a href={pathFor("de", "home")} lang="de">
                  {de.home}
                </a>
              </Button>
            </div>
          </div>
          <Hearth scene="closing" className="mt-6 h-[320px]" />
        </section>
      </SiteShell>
    </RootLayout>
  );
}
