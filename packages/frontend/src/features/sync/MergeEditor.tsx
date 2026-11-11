import { type ConflictView, type DiffRow, combinedText, diffLines } from "@nookly/shared/sync";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { qk } from "#/lib/query-keys.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Textarea } from "@nookly/ui/components/textarea";
import { cn } from "@nookly/ui/lib/utils";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

/// "14:02", or "Yesterday, 14:02" and a date once it is older.
function when(at: Date | null): string {
  if (!at) return "";
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (at.toDateString() === today.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (at.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

const show = (value: ConflictView["current"]) =>
  value === null || value === "" ? "Empty" : String(value);

/// Who made a version and when, over its column.
function SideHeader({ view, which }: { view: ConflictView; which: "current" | "other" }) {
  const side = which === "current" ? view.currentSide : view.otherSide;
  return (
    <header
      className={cn(
        "sticky top-0 z-10 col-span-2 flex min-w-0 flex-col gap-0.5 border-b border-border bg-muted px-3 py-2 font-sans",
        which === "other" && "border-r",
      )}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            which === "current" ? "bg-positive" : "bg-destructive",
          )}
        />
        <span className="font-medium">{side.device}</span>
        {side.isThisDevice && <Badge variant="primary">This device</Badge>}
        {which === "current" && <Badge>Showing now</Badge>}
      </span>
      <span className="pl-3.5 text-xs text-muted-foreground">
        {side.at ? when(side.at) : "\u00a0"}
      </span>
    </header>
  );
}

const TINT = {
  other: { line: "bg-destructive/10", gutter: "bg-destructive/15", word: "bg-destructive/35" },
  current: { line: "bg-positive/10", gutter: "bg-positive/15", word: "bg-positive/35" },
} as const;

/// One side's column: a header, then a line number and the text for every row, empty
/// where this side has no line. Both columns share the rows of one grid (subgrid), so a
/// line that wraps keeps its counterpart level with it.
function SideColumn({
  view,
  which,
  rows,
}: {
  view: ConflictView;
  which: "current" | "other";
  rows: DiffRow[];
}) {
  const side = which === "current" ? view.currentSide : view.otherSide;
  const tint = TINT[which];
  return (
    <section
      aria-label={`${side.device}'s version`}
      className={cn(
        "row-span-(--rows) row-start-1 grid grid-cols-subgrid grid-rows-subgrid",
        which === "other" ? "col-start-1 col-end-3" : "col-start-3 col-end-5",
      )}
      // SAFETY: a custom property is a valid style key; React's type only lists the known ones.
      style={{ "--rows": rows.length + 1 } as React.CSSProperties}
    >
      <SideHeader view={view} which={which} />
      {rows.map((row, index) => {
        const line = which === "current" ? row.right : row.left;
        const changed = row.kind === "changed";
        const edge = which === "other" && "border-r border-border";
        if (!line) {
          return (
            // Rows are the diff's own order and never move.
            // oxlint-disable-next-line react/no-array-index-key
            <div key={index} className={cn("col-span-2 min-h-5 bg-muted-foreground/10", edge)} />
          );
        }
        return (
          // oxlint-disable-next-line react/no-array-index-key
          <div key={index} className="contents">
            <span
              aria-hidden
              className={cn(
                "border-r border-border px-2 text-right text-muted-foreground tabular-nums select-none",
                changed && tint.gutter,
              )}
            >
              {line.number}
            </span>
            <p
              className={cn(
                "min-w-0 py-px pr-3 pl-1 wrap-break-word whitespace-pre-wrap",
                changed && tint.line,
                edge,
              )}
            >
              <span aria-hidden className="inline-block w-4 text-muted-foreground select-none">
                {changed ? (which === "current" ? "+" : "\u2212") : ""}
              </span>
              {line.segments.map((segment, at) => (
                <span
                  // The text is the same on every render, so its place is its identity.
                  // oxlint-disable-next-line react/no-array-index-key
                  key={at}
                  data-changed={segment.changed}
                  className={cn(segment.changed && changed && ["rounded-xs", tint.word])}
                >
                  {segment.text}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </section>
  );
}

/// Both versions side by side, the way a code review tool shows a change: the other
/// version on the left in red, the one showing now on the right in green, line numbers
/// in the gutters, the words that differ marked inside each line.
function SplitView({ view }: { view: ConflictView }) {
  const rows = diffLines(show(view.other), show(view.current));
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-border bg-card font-mono text-xs/5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <SideColumn view={view} which="other" rows={rows} />
        <SideColumn view={view} which="current" rows={rows} />
      </div>
    </div>
  );
}

function Detail({ view, onDone }: { view: ConflictView; onDone: () => void }) {
  const [combined, setCombined] = useState<string | null>(null);
  const boxId = useId();
  useEffect(() => setCombined(null), [view.id]);
  const decide = useMutation({
    mutationFn: (choice: Parameters<typeof syncRuntime.resolveConflict>[1]) =>
      syncRuntime.resolveConflict(view, choice),
    onSuccess: onDone,
  });
  const text = view.isText && view.kind === "field";
  const both = () =>
    combinedText(
      view.current === null ? "" : String(view.current),
      view.other === null ? "" : String(view.other),
      view.field,
    );

  if (view.kind === "removed") {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-start gap-2 text-sm">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-caution" />
          <span>
            This was removed on one device and changed on another. Nothing was deleted: you can
            bring it back.
          </span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide.mutate("other")}>
            <StatusButtonContent
              status={statusOf(decide)}
              label="Bring It Back"
              errorLabel="Couldn't bring it back"
            />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => decide.mutate("current")}>
            Keep It Removed
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SplitView view={view} />
      {combined === null ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide.mutate("current")}>
            <StatusButtonContent
              status={statusOf(decide)}
              label="Keep This One"
              errorLabel="Couldn't save it"
            />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => decide.mutate("other")}>
            Keep the Other
          </Button>
          {text && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setCombined(both())}>
                Keep Both
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCombined(both())}>
                Edit Combined Version
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={boxId} className="text-xs text-muted-foreground">
            Combined version
          </label>
          <Textarea
            id={boxId}
            aria-label="Combined version"
            rows={view.field === "title" ? 2 : 8}
            value={combined}
            onChange={(event) => setCombined(event.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide.mutate({ value: combined })}>
              <StatusButtonContent
                status={statusOf(decide)}
                label="Save Combined"
                errorLabel="Couldn't save it"
              />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCombined(null)}>
              Back
            </Button>
          </div>
        </div>
      )}
      {decide.error && <p className="text-xs text-destructive">{decide.error.message}</p>}
    </div>
  );
}

/// Changes made on two devices that disagree, and what to do about each: keep this
/// one, keep the other, keep both, or write a combined version. Opened from the
/// sync status, Settings and a page's badge. The item keeps working meanwhile, and
/// nothing is deleted: the version not chosen stays in the log.
export function MergeEditor() {
  const open = useAccountDialog((s) => s.mergeOpen);
  const setOpen = useAccountDialog((s) => s.setMergeOpen);
  const queryClient = useQueryClient();
  const [pick, setPick] = useState<string | null>(null);
  const { data: views = [], isFetched } = useQuery({
    queryKey: qk.sync.conflictViews,
    queryFn: () => syncRuntime.conflictViews(),
    enabled: open,
    refetchOnMount: "always",
  });
  const selected = views.find((v) => v.id === pick) ?? views[0];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.sync.conflictViews });
    void queryClient.invalidateQueries({ queryKey: qk.sync.conflicts });
    // A value that was put back shows in its views right away.
    void queryClient.invalidateQueries();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="@container flex max-h-[min(40rem,calc(100vh-3rem))] max-w-4xl grid-cols-1 flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Changes that need a look</DialogTitle>
          <DialogDescription>
            Two of your devices changed the same thing. The newer change is showing, nothing was
            lost, and you can keep either, both, or a mix.
          </DialogDescription>
        </DialogHeader>
        {isFetched && views.length === 0 ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <IconCheck size={16} className="text-positive" />
            Nothing needs a look.
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto @2xl:grid-cols-[14rem_1fr]">
            <ul aria-label="Conflicts" className="flex flex-col gap-1">
              {views.map((view) => (
                <li key={view.id}>
                  <button
                    type="button"
                    aria-current={view.id === selected?.id ? "true" : undefined}
                    onClick={() => setPick(view.id)}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      view.id === selected?.id ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <span className="truncate font-medium">{view.itemTitle}</span>
                    <span className="text-xs text-muted-foreground">{view.fieldLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <div className="min-w-0 pb-1">
                <h3 className="mb-3 text-sm">
                  <span className="font-medium">{selected.itemTitle}</span>
                  <span className="text-muted-foreground">, {selected.fieldLabel}</span>
                </h3>
                <Detail
                  key={selected.id}
                  view={selected}
                  onDone={() => {
                    setPick(null);
                    refresh();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
