import {
  IconAlertTriangle,
  IconExclamationMark,
  IconEyeOff,
  IconExternalLink,
  IconLoader2,
  IconLock,
  IconPuzzle,
  IconRefresh,
  IconWifiOff,
  type Icon,
} from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { Skeleton } from "skullet/react";
import { Button } from "@nookly/ui/components/button";
import { cn } from "@nookly/ui/lib/utils";
import type { Fetched } from "#/lib/api/moodle.ts";
import { type ProblemKind, describeMoodleProblem } from "./moodle-errors.ts";
import { useMoodleWebUrl } from "./moodle-context.ts";

/// A Moodle answer on its way. While it loads, a skeleton in the shape of `sample` (a stand in
/// for the real data, drawn from what `children` renders) takes the room the page will fill, so
/// nothing moves when it arrives. A problem shows `MoodleError` and an empty answer shows
/// whatever `empty` returns.
export function MoodleData<T>({
  query,
  sample,
  label,
  empty,
  children,
}: {
  query: {
    data: Fetched<T> | undefined;
    error: Error | null;
    isError: boolean;
    isFetching: boolean;
    refetch: () => void;
  };
  sample: T;
  /// What a screen reader hears while it loads.
  label: string;
  empty?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
}) {
  const data = query.data?.data;
  const emptyView = data === undefined ? null : (empty?.(data) ?? null);
  return (
    <Skeleton
      data={data}
      sample={sample}
      label={label}
      error={
        query.isError ? (
          <MoodleError
            message={query.error?.message ?? "Something went wrong."}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        ) : undefined
      }
      empty={emptyView !== null}
      emptyMessage={emptyView}
    >
      {children}
    </Skeleton>
  );
}

const PROBLEM_LOOK = {
  offline: { icon: IconWifiOff, caution: true },
  "signed-out": { icon: IconLock, caution: true },
  "grades-hidden": { icon: IconEyeOff, caution: true },
  denied: { icon: IconLock, caution: false },
  unreadable: { icon: IconPuzzle, caution: false },
  other: { icon: IconAlertTriangle, caution: false },
} satisfies Record<ProblemKind, { icon: Icon; caution: boolean }>;

/// A problem with a Moodle request, said kindly: what happened in plain words, what can be
/// done about it, and Moodle's own message for whoever wants it. It looks like an error: red,
/// or amber when the cause is the connection or the sign in rather than Moodle.
export function MoodleError({
  message,
  retrying,
  onRetry,
  className,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
  className?: string;
}) {
  const problem = describeMoodleProblem(message);
  const webUrl = useMoodleWebUrl();
  const look = PROBLEM_LOOK[problem.kind];
  const Glyph = look.icon;
  return (
    <div
      role="alert"
      className={cn(
        "relative isolate flex flex-col items-center gap-5 overflow-hidden rounded-2xl border px-6 py-12 text-center",
        look.caution ? "border-caution/40 bg-caution/5" : "border-destructive/40 bg-destructive/5",
        className,
      )}
    >
      <Halo className={look.caution ? "bg-caution/20" : "bg-destructive/20"} />
      <div className="relative">
        <div
          className={cn(
            "flex size-14 items-center justify-center rounded-2xl border",
            look.caution
              ? "border-caution/40 bg-caution/10 text-caution"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          <Glyph size={26} aria-hidden="true" />
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-2 -bottom-2 flex size-6 items-center justify-center rounded-full border-2 border-background",
            look.caution ? "bg-caution text-background" : "bg-destructive text-background",
          )}
        >
          <IconExclamationMark size={14} stroke={3} />
        </span>
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="text-base font-semibold">{problem.title}</h2>
        <p className="text-sm text-muted-foreground">{problem.description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
          Try again
        </Button>
        {problem.offerWebsite && webUrl && (
          <Button variant="ghost" size="sm" onClick={() => void openUrl(webUrl)}>
            <IconExternalLink />
            Open in Moodle
          </Button>
        )}
      </div>
      <details className="w-full max-w-md text-xs text-muted-foreground">
        <summary className="cursor-pointer rounded-sm select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          Details
        </summary>
        <p
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-left font-mono wrap-break-word",
            look.caution
              ? "border-caution/30 bg-caution/10"
              : "border-destructive/30 bg-destructive/10",
          )}
        >
          {problem.details}
        </p>
      </details>
    </div>
  );
}

/// A nothing-here-yet, with a little room around it.
export function MoodleEmpty({
  icon: Glyph,
  title,
  description,
  action,
  className,
}: {
  icon: Icon;
  title: string;
  description?: string;
  /// The one thing to do about it, a button.
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <Halo className="bg-accent-blue/10" />
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-xs">
        <Glyph size={26} aria-hidden="true" className="text-muted-foreground" />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/// A soft glow behind the icon.
function Halo({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div
        className={cn(
          "absolute top-6 left-1/2 size-56 -translate-x-1/2 rounded-full blur-3xl",
          className,
        )}
      />
    </div>
  );
}
