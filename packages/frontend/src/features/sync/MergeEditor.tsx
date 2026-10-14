import { type ConflictView, combinedText, diffWords } from "@nookly/shared/sync";
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

/// One version: who made it, when, and the text with what differs marked.
function Version({
  view,
  which,
  segments,
}: {
  view: ConflictView;
  which: "current" | "other";
  segments: { text: string; changed: boolean }[] | null;
}) {
  const side = which === "current" ? view.currentSide : view.otherSide;
  const value = which === "current" ? view.current : view.other;
  return (
    <section
      aria-label={`${side.device}'s version`}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
    >
      <header className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-medium">{side.device}</span>
        {side.isThisDevice && <Badge variant="primary">This device</Badge>}
        {which === "current" && <Badge>Showing now</Badge>}
        {side.at && <span className="ml-auto text-xs text-muted-foreground">{when(side.at)}</span>}
      </header>
      <p className="text-sm wrap-break-word whitespace-pre-wrap">
        {segments
          ? segments.map((segment, index) => (
              <span
                // The text is the same on every render, so its place is its identity.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                data-changed={segment.changed}
                className={cn(segment.changed && "rounded-sm bg-caution/20")}
              >
                {segment.text}
              </span>
            ))
          : show(value)}
      </p>
    </section>
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
  const diff = text ? diffWords(show(view.current), show(view.other)) : null;
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
      <div className="grid gap-3 @2xl:grid-cols-2">
        <Version view={view} which="current" segments={diff?.left ?? null} />
        <Version view={view} which="other" segments={diff?.right ?? null} />
      </div>
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
