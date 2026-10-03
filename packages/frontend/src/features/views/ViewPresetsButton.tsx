import { IconCheck, IconLayoutList } from "@tabler/icons-react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { iconLibraryValue, renderIconValue } from "#/components/entity-icon.tsx";
import { type ActionStatus, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import type { FilterField } from "#/components/filter-menu.tsx";
import type { Space } from "#/lib/api/types.ts";
import { createView, listViews, type ViewModule } from "#/lib/api/views.ts";
import { viewTarget } from "./view-target";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  spaces,
  module,
  presets,
  fields,
  describeDisplay,
}: {
  spaceId: string;
  /// Set on a cross-Space page. Its Views show every Space's items whichever Space stores
  /// them, so a preset is stored in `spaceId` and counts as added when any Space has it.
  spaces?: Space[];
  module: ViewModule;
  presets: ViewPreset<D>[];
  /// The page's filter fields, to name each preset's filters.
  fields: FilterField[];
  describeDisplay: (display: D) => DisplaySummary;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const scopeIds = spaces ? spaces.map((s) => s.id) : [spaceId];
  const views = useQueries({
    queries: scopeIds.map((id) => ({
      queryKey: qk.views.byModule(id, module),
      queryFn: () => listViews(id, module),
      enabled: open,
    })),
    combine: (results) => results.flatMap((r) => r.data ?? []),
  });
  const existing = (preset: ViewPreset<D>) =>
    views.find((v) => !v.entity.deletedAt && v.entity.title === preset.name);

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
    useNavStore.getState().setView(viewTarget(module, spaceId, viewId));
  }

  const pendingName = add.variables?.name;

  return (
    <>
      <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={() => setOpen(true)}>
        <IconLayoutList />
        View presets
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>View presets</DialogTitle>
            <DialogDescription>
              Ready made views. Adding one saves it{" "}
              {spaces ? "for all your Spaces" : "to this Space"}, where you can change it freely.
            </DialogDescription>
          </DialogHeader>
          <div className="grid h-120 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto sm:grid-cols-2">
            {presets.map((p) => {
              const found = existing(p);
              return (
                <PresetCard
                  key={p.name}
                  preset={p}
                  fields={fields}
                  summary={describeDisplay(p.display)}
                  added={!!found}
                  status={pendingName === p.name ? statusOf(add) : "idle"}
                  onAdd={() => !add.isPending && add.mutate(p)}
                  onOpen={() => found && openView(found.entity.id)}
                />
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PresetCard<D>({
  preset,
  fields,
  summary,
  added,
  status,
  onAdd,
  onOpen,
}: {
  preset: ViewPreset<D>;
  fields: FilterField[];
  summary: DisplaySummary;
  added: boolean;
  status: ActionStatus;
  onAdd: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <LayoutSketch summary={summary} />
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-accent">
          {renderIconValue(iconLibraryValue(preset.icon, preset.color), 16)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{preset.name}</h3>
          <p className="line-clamp-2 min-h-10 text-xs text-muted-foreground">
            {preset.description}
          </p>
        </div>
      </div>
      <div className="flex h-14 flex-wrap content-start gap-1.5 overflow-hidden">
        {preset.filters.map((f) => {
          const field = fields.find((x) => x.id === f.fieldId);
          const names = f.values.map((v) => field?.options.find((o) => o.value === v)?.label ?? v);
          return (
            <span
              key={f.fieldId}
              className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-foreground/10 px-2 text-xs"
            >
              {field && <field.icon size={12} className="shrink-0 text-muted-foreground" />}
              <span className="shrink-0 text-muted-foreground">
                {field?.label ?? f.fieldId} {f.operator === "is" ? "is" : "is not"}
              </span>
              <span className="min-w-0 truncate font-medium">{names.join(", ")}</span>
            </span>
          );
        })}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {summary.layout === "board" ? "Board" : "List"}
        {summary.grouping ? `, by ${summary.grouping.toLowerCase()}` : ""}
        {`, ordered by ${summary.ordering.toLowerCase()}`}
      </p>
      {added ? (
        <Button variant="secondary" size="sm" className="mt-auto gap-1.5" onClick={onOpen}>
          <IconCheck />
          Open view
        </Button>
      ) : (
        <Button size="sm" className="mt-auto" onClick={() => status !== "pending" && onAdd()}>
          <StatusButtonContent
            status={status}
            label="Add view"
            successLabel="Added"
            errorLabel="Try again"
          />
        </Button>
      )}
    </div>
  );
}

const BAR = "h-1.5 rounded-full bg-foreground/15";

/// A wireframe of the layout: group headers over rows for a list, columns of cards
/// for a board.
function LayoutSketch({ summary }: { summary: DisplaySummary }) {
  if (summary.layout === "board") {
    return (
      <div
        aria-hidden
        className="flex h-24 gap-2 overflow-hidden rounded-lg border border-border bg-foreground/3 p-2"
      >
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
      className="flex h-24 flex-col overflow-hidden rounded-lg border border-border bg-foreground/3"
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
