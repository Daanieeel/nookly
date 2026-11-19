import { IconAlertTriangle } from "@tabler/icons-react";
import { dictionary } from "@/content";
import { type LegalPage, legal } from "@/content/legal";
import { type Locale, pathFor } from "@/lib/i18n";
import { SiteShell } from "../site-shell";

/// Impressum, privacy policy and terms: one plain column of text under a note that the
/// text is a placeholder.
export function LegalPageView({ locale, page }: { locale: Locale; page: LegalPage }) {
  const t = dictionary(locale).legal;
  const doc = legal(locale, page);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(doc.updated));
  return (
    <SiteShell locale={locale} page={page}>
      <div className="bg-background">
        <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-28 pb-20 sm:px-6 sm:pt-32">
          <header className="flex flex-col gap-3">
            <h1 className="font-display text-[clamp(2.2rem,5vw,3rem)] leading-none font-semibold">
              {doc.title}
            </h1>
            <p className="text-sm text-muted-foreground">{t.updated(date)}</p>
          </header>
          <p className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
            <span>
              {t.sample}
              {locale === "en" && (
                <>
                  {" "}
                  <a href={pathFor("de", page)} className="underline underline-offset-2">
                    {t.germanVersion}
                  </a>
                </>
              )}
            </span>
          </p>
          {doc.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h2 className="font-display text-lg font-semibold">{section.heading}</h2>
              {section.body.map((line) => (
                <p key={line} className="text-sm/relaxed  text-muted-foreground">
                  {line}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </SiteShell>
  );
}
