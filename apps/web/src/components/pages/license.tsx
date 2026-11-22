import { IconCheck, IconInfoCircle, IconScale, IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { AGPL_URL, license, licenseAnchor } from "@/content/license";
import type { Locale } from "@/lib/i18n";
import { type LicenseBlock, licenseBlocks, licenseText } from "@/lib/license-text";
import { SiteShell } from "../site-shell";
import { LicenseContents } from "./license-contents";

/// Each group of the summary has its own mark, as on GitHub's license pages: what you may do,
/// what you do not get, and what you owe.
const GROUP_ICONS = [
  <IconCheck key="ok" size={16} className="text-positive" />,
  <IconX key="no" size={16} className="text-destructive" />,
  <IconInfoCircle key="owe" size={16} className="text-primary" />,
];

const LINK = "underline underline-offset-2";

/// A line of the license with the `<https://...>` addresses in it made into links.
function Linked({ text }: { text: string }): ReactNode {
  return text.split(/<(https?:\/\/[^>\s]+)>/).map((part, i) =>
    i % 2 === 1 ? (
      <a key={`${i}-${part}`} href={part} rel="noopener" className={LINK}>
        {part}
      </a>
    ) : (
      part
    ),
  );
}

const BODY = "text-sm/relaxed text-justify text-foreground/80";

function Block({ block }: { block: LicenseBlock }) {
  const id = licenseAnchor(block.text);
  switch (block.kind) {
    case "title":
      return (
        <h2 id={id} className="scroll-mt-24 font-display text-2xl font-semibold">
          {block.text}
        </h2>
      );
    case "version":
      return <p className="text-sm text-foreground/80">{block.text}</p>;
    case "h3":
      return (
        <h3 id={id} className="mt-4 scroll-mt-24 font-display text-xl font-semibold">
          {block.text}
        </h3>
      );
    case "h4":
      return (
        <h4 id={id} className="mt-2 scroll-mt-24 font-display text-base font-semibold">
          {block.text}
        </h4>
      );
    case "item":
      return (
        <p className={`${BODY} pl-6`}>
          <Linked text={block.text} />
        </p>
      );
    case "code":
      return (
        <pre
          lang="en"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable text must be reachable by keyboard
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-xs/relaxed"
        >
          {block.text}
        </pre>
      );
    case "p":
      return (
        <p className={BODY}>
          <Linked text={block.text} />
        </p>
      );
  }
}

/// The license in short, in one card: what the AGPL lets you do, what it does not give you and
/// what it asks of you. Under it the full text, drawn from the repository's `LICENSE`.
export function LicenseArticle({ locale }: { locale: Locale }) {
  const doc = license(locale);
  const blocks = licenseBlocks(licenseText());
  const entries = blocks.flatMap((block) =>
    block.kind === "h3" || block.kind === "h4"
      ? [
          {
            id: licenseAnchor(block.text),
            title: block.text,
            level: block.kind === "h3" ? (3 as const) : (4 as const),
          },
        ]
      : [],
  );
  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-28 sm:px-6 sm:pt-32">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(2.2rem,5vw,3rem)] leading-none font-semibold">
          {doc.title}
        </h1>
        <p className="text-sm/relaxed text-muted-foreground">{doc.intro}</p>
      </header>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-xl border border-border bg-background text-primary"
            >
              <IconScale size={28} />
            </span>
            <div className="flex min-w-0 flex-col">
              <p className="text-sm text-muted-foreground">{doc.licensedUnder}</p>
              <h2 className="font-display text-xl font-semibold sm:text-2xl">{doc.name}</h2>
            </div>
          </div>
          <p className="text-sm/relaxed text-justify text-muted-foreground">{doc.summary}</p>
          <div className="grid gap-6 sm:grid-cols-3">
            {doc.groups.map((group, index) => (
              <section key={group.heading} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{group.heading}</h3>
                <ul className="flex flex-col gap-2.5 text-sm">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <span aria-hidden className="shrink-0">
                        {GROUP_ICONS[index]}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground sm:px-8">
          {doc.disclaimer}{" "}
          <a href={AGPL_URL} rel="noopener" className={`${LINK} text-primary`}>
            {doc.learnMore}
          </a>
        </p>
      </section>
      <section className="flex flex-col gap-4">
        {doc.fullNote && <p className="text-sm/relaxed text-muted-foreground">{doc.fullNote}</p>}
        {blocks.map((block, index) => (
          <Block key={`${index}-${block.text.slice(0, 24)}`} block={block} />
        ))}
      </section>
      <LicenseContents label={doc.contents} entries={entries} />
    </article>
  );
}

export function LicensePageView({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale} page="license">
      <div className="bg-background">
        <LicenseArticle locale={locale} />
      </div>
    </SiteShell>
  );
}
