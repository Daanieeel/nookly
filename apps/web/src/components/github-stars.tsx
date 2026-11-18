"use client";

import { useEffect, useState } from "react";
import { IconBrandGithub, IconStarFilled } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { GITHUB_REPO, GITHUB_URL } from "@/lib/site";

const CACHE_KEY = "nookly.stars";

function readCache(): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/// The GitHub mark and the repository's stars: the count from the build, refreshed once
/// per visit (GitHub allows a browser 60 requests an hour).
export function GithubStars({ locale, initial }: { locale: Locale; initial: number | null }) {
  const t = dictionary(locale).nav;
  const [stars, setStars] = useState(initial);

  useEffect(() => {
    const cached = readCache();
    if (cached !== null && Number.isFinite(cached)) {
      setStars(cached);
      return;
    }
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((repo: { stargazers_count?: number } | null) => {
        if (typeof repo?.stargazers_count !== "number") return;
        setStars(repo.stargazers_count);
        try {
          sessionStorage.setItem(CACHE_KEY, String(repo.stargazers_count));
        } catch {
          // Private windows may refuse storage; the count still shows.
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const formatted =
    stars === null
      ? null
      : new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
          stars,
        );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={GITHUB_URL}
          aria-label={formatted ? `${t.github}, ${t.stars(formatted)}` : t.github}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-accent px-2.5 text-xs font-medium transition-colors hover:bg-accent/80"
        >
          <IconBrandGithub size={16} aria-hidden />
          {formatted && (
            <>
              <span className="h-3.5 w-px bg-border" aria-hidden />
              <IconStarFilled size={12} aria-hidden className="text-caution" />
              <span className="tabular-nums">{formatted}</span>
            </>
          )}
        </a>
      </TooltipTrigger>
      <TooltipContent>{formatted ? t.stars(formatted) : t.github}</TooltipContent>
    </Tooltip>
  );
}
