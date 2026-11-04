import { IconChevronRight, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleCourse } from "#/lib/api/moodle.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { qk } from "#/lib/query-keys.ts";
import { armNewTabIntent, useNavStore } from "#/lib/store/nav.ts";
import { CourseArt } from "./CourseArt.tsx";
import { MoodleWebUrlContext } from "./moodle-context.ts";
import { refreshMoodle } from "./moodle-queries.ts";

/// The look of the pills at the top: a pane over whatever scrolls under them, which lifts
/// once the page has scrolled and they float.
const PILL =
  "flex flex-wrap items-center rounded-lg border border-border bg-background/70 p-0.5 shadow-none backdrop-blur-sm transition-all duration-300 group-data-stuck/bar:bg-background/90 group-data-stuck/bar:shadow-md";

/// Goes to a page of the Moodle module in the Space it is open in. A Cmd or Ctrl click
/// opens it in a background tab, like every other link in the app. `newTab` opens a tab and
/// shows it.
export function useMoodleNavigate(spaceId: string) {
  const setView = useNavStore((s) => s.setView);
  const openInNewTab = useNavStore((s) => s.openInNewTab);
  return (path: string, event?: MouseEvent, newTab = false) => {
    const view = {
      kind: "module",
      spaceId,
      module: "moodle",
      moodlePath: path || undefined,
    } as const;
    // A tab of its own, shown right away.
    if (newTab) return openInNewTab(view);
    if (event && (event.metaKey || event.ctrlKey)) armNewTabIntent();
    setView(view);
  };
}

export interface Crumb {
  label: string;
  path: string;
}

/// What every Moodle page is wrapped in: where you are, a way back up, whether what you see
/// is the last answer because Moodle could not be reached, and the button that opens the
/// same page on Moodle itself. With a `course`, the top of the page is that course's banner.
export function MoodleFrame({
  spaceId,
  title,
  crumbs,
  webUrl,
  fetchedAt,
  offline,
  course,
  tall,
  subtitle,
  header,
  actions,
  children,
}: {
  spaceId: string;
  title: string;
  crumbs: Crumb[];
  /// The same page on the Moodle website.
  webUrl: string | null;
  fetchedAt?: string;
  offline?: boolean;
  /// Puts the course's banner at the top of the page.
  course?: Pick<MoodleCourse, "id" | "overviewFiles">;
  /// A taller banner, for the course's own page.
  tall?: boolean;
  /// Under the title, on the banner.
  subtitle?: ReactNode;
  /// Replaces the whole top of the page. Leave room at its top for the bar that floats there.
  header?: ReactNode;
  /// Replaces the buttons at the top right.
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { sentinel, stuck } = useStuck();
  return (
    <MoodleWebUrlContext.Provider value={webUrl}>
      <div className="relative">
        <div
          ref={sentinel}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 h-px"
        />
        {/* Zero tall, so it takes no room: its buttons float over the top of the page and stay
            in view while the rest scrolls. At rest they sit inside the page's column; once it
            has scrolled they glide out to the edges of the window. */}
        <div
          data-stuck={stuck ? "" : undefined}
          className="group/bar pointer-events-none sticky top-0 z-20 h-0"
        >
          <div className="mx-auto flex max-w-5xl items-start justify-between gap-2 px-3 pt-3 transition-all duration-300 group-data-stuck/bar:max-w-400 group-data-stuck/bar:px-1 group-data-stuck/bar:pt-1">
            <div className="pointer-events-auto">
              <Crumbs spaceId={spaceId} crumbs={crumbs} />
            </div>
            <div className="pointer-events-auto">
              {actions ?? <FrameActions webUrl={webUrl} fetchedAt={fetchedAt} offline={offline} />}
            </div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-8">
          {header ??
            (course ? (
              <CourseArt
                course={course}
                className={cn("rounded-2xl border border-border", tall ? "h-52" : "h-32")}
              >
                <div className="absolute inset-0 bg-linear-to-t from-card via-card/50 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5">
                  <h1 className={cn("font-semibold tracking-tight", tall ? "text-2xl" : "text-lg")}>
                    {title}
                  </h1>
                  {subtitle}
                </div>
              </CourseArt>
            ) : (
              <h1 className="pt-14 text-xl font-semibold tracking-tight">{title}</h1>
            ))}
          {children}
        </div>
      </div>
    </MoodleWebUrlContext.Provider>
  );
}

/// Whether the page has been scrolled so far that the bar at its top is floating.
function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry?.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { sentinel, stuck };
}

function Crumbs({ spaceId, crumbs }: { spaceId: string; crumbs: Crumb[]; glass?: boolean }) {
  const go = useMoodleNavigate(spaceId);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Where you are in Moodle" className={PILL}>
      {crumbs.map((crumb, index) => (
        <span key={crumb.path || "root"} className="flex items-center">
          {index > 0 && (
            <IconChevronRight size={12} aria-hidden="true" className="text-muted-foreground/60" />
          )}
          <button
            type="button"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => go(crumb.path, e)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
      <IconChevronRight size={12} aria-hidden="true" className="mr-1 text-muted-foreground/60" />
    </nav>
  );
}

/// When Moodle was last read, the way to read it again, and the way to the same page on Moodle,
/// in one pill. `trailing` adds more buttons to its end.
export function FrameActions({
  webUrl,
  fetchedAt,
  offline,
  trailing,
}: {
  webUrl: string | null;
  fetchedAt?: string;
  offline?: boolean;
  trailing?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const refreshing =
    useIsFetching({
      queryKey: qk.moodle.root,
      predicate: (query) => query.queryKey[1] !== "status" && query.queryKey[1] !== "image",
    }) > 0;
  return (
    <div className={cn(PILL, "flex-nowrap gap-0.5")}>
      {fetchedAt && (
        <span className="flex items-center gap-1.5 px-2.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", offline ? "bg-caution" : "bg-positive")}
          />
          {offline ? "Offline, as of " : "Updated "}
          {formatEditedAt(fetchedAt).toLowerCase()}
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Refresh"
            disabled={refreshing}
            onClick={() => void refreshMoodle(queryClient)}
          >
            <IconRefresh size={14} className={cn(refreshing && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>
      {webUrl && (
        <>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={() => void openUrl(webUrl)}>
            <IconExternalLink size={14} />
            Open in Moodle
          </Button>
        </>
      )}
      {trailing}
    </div>
  );
}
