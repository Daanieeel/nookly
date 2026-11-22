import type { ReactNode } from "react";
import { dictionary } from "@/content";
import { type LegalPage, legal } from "@/content/legal";
import { type Locale, pathFor } from "@/lib/i18n";
import { SiteShell } from "../site-shell";

/// What becomes a link in a line: `[words](/path)` to a page of this site, an email address,
/// the GitHub repository or a `www.` address.
const LINKABLE =
  /\[([^\]]+)\]\((\/[^)\s]*)\)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+|github\.com\/[\w-]+\/[\w-]+|www\.[\w-]+(?:\.[\w-]+)+)/g;

function hrefOf(text: string) {
  return text.includes("@") ? `mailto:${text}` : `https://${text}`;
}

const LINK = "underline underline-offset-2";

/// A line of text with its links made clickable.
function Line({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(LINKABLE)) {
    const at = match.index;
    if (at > from) parts.push(text.slice(from, at));
    const [whole, label, path, address] = match;
    parts.push(
      label && path ? (
        <a key={at} href={path} className={LINK}>
          {label}
        </a>
      ) : (
        <a key={at} href={hrefOf(address ?? whole)} rel="noopener" className={LINK}>
          {address}
        </a>
      ),
    );
    from = at + whole.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/// Impressum, privacy policy and terms: one plain column of text. German is the binding
/// version, so the English pages say so and link to it.
export function LegalArticle({ locale, page }: { locale: Locale; page: LegalPage }) {
  const t = dictionary(locale).legal;
  const doc = legal(locale, page);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(doc.updated));
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-28 pb-20 sm:px-6 sm:pt-32">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(2.2rem,5vw,3rem)] leading-none font-semibold">
          {doc.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t.updated(date)}
          {locale === "en" && (
            <>
              {" · "}
              <a href={pathFor("de", page)} className="underline underline-offset-2">
                {t.germanVersion}
              </a>
            </>
          )}
        </p>
      </header>
      {doc.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">{section.heading}</h2>
          {section.body.map((line) => (
            <p key={line} className="text-sm/relaxed text-muted-foreground">
              <Line text={line} />
            </p>
          ))}
          {section.list && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm/relaxed text-muted-foreground marker:text-border">
              {section.list.map((item) => (
                <li key={item}>
                  <Line text={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

export function LegalPageView({ locale, page }: { locale: Locale; page: LegalPage }) {
  return (
    <SiteShell locale={locale} page={page}>
      <div className="bg-background">
        <LegalArticle locale={locale} page={page} />
      </div>
    </SiteShell>
  );
}
