import { IconMenu2 } from "@tabler/icons-react";
import { dictionary } from "@/content";
import { type Locale, type Page, pathFor } from "@/lib/i18n";
import { latestRelease, starCount } from "@/lib/releases";
import { DownloadButton } from "./download-button";
import { GithubStars } from "./github-stars";
import { LanguageLink, LanguageSwitch } from "./language-switch";
import { ThemeSwitch } from "./theme-switch";
import { Logo } from "./logo";
import { NavShell, ScrolledOnly } from "./nav-shell";

/// The bar at the top of every page. `page` keeps the language link on the same page.
export async function Nav({ locale, page }: { locale: Locale; page: Page }) {
  const t = dictionary(locale).nav;
  const [release, stars] = await Promise.all([latestRelease(), starCount()]);
  const home = pathFor(locale, "home");
  const links = [
    { href: `${home === "/" ? "" : home}/#features`, label: t.features },
    { href: pathFor(locale, "download"), label: t.download },
    { href: pathFor(locale, "status"), label: t.status },
    { href: `${home === "/" ? "" : home}/#faq`, label: t.faq },
  ];

  return (
    <NavShell
      logo={
        <a href={home} aria-label="Nookly" className="shrink-0">
          <Logo />
        </a>
      }
      links={
        <nav aria-label={t.menu} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      }
      actions={
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center">
            <span className="hidden sm:inline-flex">
              <LanguageSwitch locale={locale} page={page} />
            </span>
            <ThemeSwitch locale={locale} />
          </span>
          <GithubStars locale={locale} initial={stars} />
          <ScrolledOnly>
            <DownloadButton locale={locale} release={release} size="sm" />
          </ScrolledOnly>
          <details className="group relative md:hidden">
            <summary
              aria-label={t.menu}
              className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md hover:bg-accent [&::-webkit-details-marker]:hidden"
            >
              <IconMenu2 size={18} aria-hidden />
            </summary>
            <div className="absolute top-10 right-0 flex w-56 flex-col rounded-lg border border-border bg-popover p-1.5 shadow-lg">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent"
                >
                  {link.label}
                </a>
              ))}
              <LanguageLink locale={locale} page={page} />
            </div>
          </details>
        </div>
      }
    />
  );
}
