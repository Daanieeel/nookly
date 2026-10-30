import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent, ReactNode } from "react";
import { FieldError } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Skeleton } from "@nookly/ui/components/skeleton";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { armNewTabIntent, useNavStore } from "#/lib/store/nav.ts";
import { messageOf } from "./moodle-login.ts";
import { refreshMoodle } from "./moodle-queries.ts";

/// Goes to a page of the Moodle module in the Space it is open in. A Cmd or Ctrl click
/// opens it in a new tab, like every other link in the app.
export function useMoodleNavigate(spaceId: string) {
  const setView = useNavStore((s) => s.setView);
  return (path: string, event?: MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey)) armNewTabIntent();
    setView({ kind: "module", spaceId, module: "moodle", moodlePath: path || undefined });
  };
}

export interface Crumb {
  label: string;
  path: string;
}

/// What every Moodle page is wrapped in: where you are, a way back up, whether what you see
/// is the last answer because Moodle could not be reached, and the button that opens the
/// same page on Moodle itself.
export function MoodleFrame({
  spaceId,
  title,
  crumbs,
  webUrl,
  fetchedAt,
  offline,
  children,
}: {
  spaceId: string;
  title: string;
  crumbs: Crumb[];
  /// The same page on the Moodle website.
  webUrl: string | null;
  fetchedAt?: string;
  offline?: boolean;
  children: ReactNode;
}) {
  const go = useMoodleNavigate(spaceId);
  const queryClient = useQueryClient();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {crumbs.length > 0 && (
        <nav
          aria-label="Where you are in Moodle"
          className="flex flex-wrap gap-1 text-xs text-muted-foreground"
        >
          {crumbs.map((crumb) => (
            <span key={crumb.path || "root"} className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-sm hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => go(crumb.path, e)}
              >
                {crumb.label}
              </button>
              <span aria-hidden>/</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 flex-1 basis-60 text-lg font-semibold">{title}</h1>
        {fetchedAt && (
          <span className="text-xs text-muted-foreground">
            {offline ? "Offline, as of " : "Updated "}
            {formatEditedAt(fetchedAt).toLowerCase()}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={() => void refreshMoodle(queryClient)}>
          <IconRefresh size={14} />
          Refresh
        </Button>
        {webUrl && (
          <Button variant="secondary" size="sm" onClick={() => void openUrl(webUrl)}>
            <IconExternalLink size={14} />
            Open in Moodle
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

/// What a query that has not answered yet shows: a placeholder while loading, the reason
/// when Moodle refused.
export function Loading({ query }: { query: { isError: boolean; error: Error | null } }) {
  if (query.error) return <FieldError message={messageOf(query.error)} />;
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
    </div>
  );
}
