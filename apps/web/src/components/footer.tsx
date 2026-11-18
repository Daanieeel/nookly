import { dictionary } from "@/content";
import { type Locale, pathFor } from "@/lib/i18n";
import { GITHUB_URL, RELEASES_URL } from "@/lib/site";
import { Logo } from "./logo";

export function Footer({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const home = pathFor(locale, "home");
  const columns = [
    {
      title: t.footer.product,
      links: [
        { href: `${home === "/" ? "" : home}/#features`, label: t.nav.features },
        { href: pathFor(locale, "download"), label: t.nav.download },
        { href: pathFor(locale, "status"), label: t.nav.status },
        { href: RELEASES_URL, label: t.footer.releases },
      ],
    },
    {
      title: t.footer.community,
      links: [
        { href: GITHUB_URL, label: t.footer.source },
        { href: `${GITHUB_URL}/issues`, label: t.footer.issues },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { href: pathFor(locale, "imprint"), label: t.footer.imprint },
        { href: pathFor(locale, "privacy"), label: t.footer.privacy },
        { href: pathFor(locale, "terms"), label: t.footer.terms },
      ],
    },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 pb-8 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-60 text-sm text-muted-foreground">{t.footer.tagline}</p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-medium text-muted-foreground">{column.title}</h2>
            {column.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="w-fit text-sm transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 pb-6 text-xs text-muted-foreground sm:px-6">
        <span>© {new Date().getFullYear()} Nookly</span>
        <span>{t.footer.license}</span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none mx-auto -mb-[0.22em] max-w-6xl px-4 text-center font-display text-[clamp(5rem,22vw,17rem)] leading-none font-semibold text-foreground/[0.045] select-none sm:px-6"
      >
        Nookly
      </div>
    </footer>
  );
}
