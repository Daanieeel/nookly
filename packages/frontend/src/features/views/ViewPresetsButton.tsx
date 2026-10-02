import { IconCheck, IconLayoutList } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { iconLibraryValue, renderIconValue } from "#/components/entity-icon.tsx";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import type { FilterField } from "#/components/filter-menu.tsx";
import { createView, listViews, type ViewModule } from "#/lib/api/views.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { cn } from "@nookly/ui/lib/utils";
import { serializeViewConfig } from "./view-config";
import type { DisplaySummary, ViewPreset } from "./view-presets";

/// The "View presets" button and its dialog: the app's ready made Views for a
/// module, each with a preview of what it filters and how it lays out. Adding one
/// saves it as a View of the Space and opens it; a preset the Space already has
/// opens that View instead of adding a second copy.
export function ViewPresetsButton<D>({
  spaceId,
  module,
  presets,
  fields,
  describeDisplay,
}: {
  spaceId: string;
  module: ViewModule;
  presets: ViewPreset<D>[];
  /// The page's filter fields, to name each preset's filters.
  fields: FilterField[];
  describeDisplay: (display: D) => DisplaySummary;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const { data: views = [] } = useQuery({
    queryKey: qk.views.byModule(spaceId, module),
    queryFn: () => listViews(spaceId, module),
    enabled: open,
  });
  const existing = (preset: ViewPreset<D>) =>
    views.find((v) => !v.entity.deletedAt && v.entity.title === preset.name);
  const preset = presets[selected];
  const found = existing(preset);

  const add = useMutation({
    mutationFn: (p: ViewPreset<D>) =>
      createView(
        spaceId,
        p.name,
        module,
        serializeViewConfig(p.filters, p.display),
        iconLibraryValue(p.icon, p.color),
      ),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: qk.views.bySpace(spaceId) });
      await queryClient.invalidateQueries({ queryKey: qk.entity.root });
      openView(created.entity.id);
    },
  });
  const { reset } = add;
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  function openView(viewId: string) {
    setOpen(false);
    useNavStore.getState().setView({ kind: "module", spaceId, module, viewId });
  }

  const status = statusOf(add);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <IconLayoutList />
        View presets
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>View presets</DialogTitle>
            <DialogDescription>
              Ready made views. Adding one saves it to this Space, where you can change it freely.
            </DialogDescription>
          </DialogHeader>
          <div className="grid h-[30rem] grid-cols-[13rem_minmax(0,1fr)] overflow-hidden">
            <ul className="flex flex-col gap-0.5 overflow-y-auto p-2">
              {presets.map((p, i) => (
                <li key={p.name}>
                  <button
                    type="button"
                    aria-pressed={i === selected}
                    onClick={() => setSelected(i)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60",
                      i === selected && "bg-accent",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {renderIconValue(iconLibraryValue(p.icon, p.color), 16)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {existing(p) && <IconCheck size={14} className="text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
            <PresetPreview
              preset={preset}
              fields={fields}
              summary={describeDisplay(preset.display)}
            />
          </div>
          <DialogFooter>
            {add.isError && (
              <span role="alert" className="mr-auto text-xs text-destructive">
                Couldn't add the view, try again
              </span>
            )}
            {found ? (
              <Button variant="secondary" onClick={() => openView(found.entity.id)}>
                Open view
              </Button>
            ) : (
              <Button
                onClick={() => (status === "idle" || status === "error") && add.mutate(preset)}
              >
                <StatusButtonContent
                  status={status}
                  label="Add view"
                  successLabel="Added"
                  errorLabel="Try again"
                />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PresetPreview<D>({
  preset,
  fields,
  summary,
}: {
  preset: ViewPreset<D>;
  fields: FilterField[];
  summary: DisplaySummary;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-accent">
          {renderIconValue(iconLibraryValue(preset.icon, preset.color), 18)}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{preset.name}</h3>
          <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{preset.description}</p>
        </div>
      </div>

      <section className="flex flex-col gap-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">Filters</h4>
        <div className="flex min-h-14 flex-wrap content-start gap-1.5">
          {preset.filters.map((f) => {
            const field = fields.find((x) => x.id === f.fieldId);
            const names = f.values.map(
              (v) => field?.options.find((o) => o.value === v)?.label ?? v,
            );
            return (
              <span
                key={f.fieldId}
                className="inline-flex h-6 items-center gap-1.5 rounded-md border border-foreground/10 px-2 text-xs"
              >
                {field && <field.icon size={12} className="text-muted-foreground" />}
                <span className="text-muted-foreground">{field?.label ?? f.fieldId}</span>
                <span className="text-muted-foreground">
                  {f.operator === "is" ? "is" : "is not"}
                </span>
                <span className="font-medium">{names.join(", ")}</span>
              </span>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">Layout</h4>
        <p className="min-h-10 text-sm">
          {summary.layout === "board" ? "Board" : "List"}
          {summary.grouping ? `, grouped by ${summary.grouping.toLowerCase()}` : ", no grouping"}
          {`, ordered by ${summary.ordering.toLowerCase()}`}
        </p>
        <LayoutSketch summary={summary} />
      </section>
    </div>
  );
}

const BAR = "h-1.5 rounded-full bg-foreground/15";

/// A wireframe of the layout: group headers over rows for a list, columns of cards
/// for a board.
function LayoutSketch({ summary }: { summary: DisplaySummary }) {
  if (summary.layout === "board") {
    return (
      <div aria-hidden className="flex h-44 gap-2 overflow-hidden rounded-lg border border-border bg-foreground/3 p-2">
        {[3, 2, 1].map((cards, col) => (
          <div key={col} className="flex flex-1 flex-col gap-1.5">
            <div className={cn(BAR, "w-1/2 bg-foreground/30")} />
            {Array.from({ length: cards }, (_, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-md bg-card p-1.5 shadow-xs">
                <div className={cn(BAR, "w-4/5")} />
                <div className={cn(BAR, "w-1/3")} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  const groups = summary.grouping ? [2, 2] : [4];
  return (
    <div
      aria-hidden
      className="flex h-44 flex-col overflow-hidden rounded-lg border border-border bg-foreground/3"
    >
      {groups.map((rows, g) => (
        <div key={g}>
          {summary.grouping && (
            <div className="flex h-6 items-center gap-1.5 border-b border-border bg-foreground/4 px-2">
              <div className={cn(BAR, "w-16 bg-foreground/30")} />
            </div>
          )}
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex h-6 items-center gap-2 border-b border-border/60 px-2">
              <div className="size-2.5 rounded-full border border-foreground/25" />
              <div className={cn(BAR, i % 2 ? "w-2/5" : "w-3/5")} />
              <div className={cn(BAR, "ml-auto w-8")} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
