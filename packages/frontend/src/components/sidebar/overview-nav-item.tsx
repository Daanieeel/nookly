import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { IconChevronRight, IconPlus, type Icon as TablerIcon } from "@tabler/icons-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@nookly/ui/components/sidebar";
import { cn } from "@nookly/ui/lib/utils";
import { serializeViewConfig } from "#/features/views/view-config.ts";
import { ViewDialog } from "#/features/views/ViewDialog.tsx";
import { viewTarget } from "#/features/views/view-target.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import {
  type OverviewModule,
  type SavedView,
  listViews,
  reorderOverviewViews,
} from "#/lib/api/views.ts";
import { qk } from "#/lib/query-keys.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import { ViewRow } from "./expandable-module-children";

/// A cross-Space page's sidebar row, collapsible like a module row inside a Space: a
/// chevron reveals its saved Views (drag to reorder) and a "New view" row. The Views
/// live in whichever Space each was saved in, so they are gathered from all of them.
export function OverviewNavItem({
  label,
  icon: Icon,
  target,
  module,
}: {
  label: string;
  icon: TablerIcon;
  target: Extract<View, { kind: "tasks" | "assignments" }>;
  module: OverviewModule;
}) {
  const queryClient = useQueryClient();
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  const activeViewId = view.kind === target.kind ? view.viewId : undefined;
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Opening a View from anywhere (the palette, Back) reveals it in the sidebar.
  useEffect(() => {
    if (activeViewId) setOpen(true);
  }, [activeViewId]);

  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  // Each Space's own list, so anything that changes a View there refreshes this too.
  const stored = useQueries({
    queries: spaces.map((space) => ({
      queryKey: qk.views.byModule(space.id, module),
      queryFn: () => listViews(space.id, module),
      enabled: open,
    })),
    combine: (results): SavedView[] =>
      results
        .flatMap((r) => r.data ?? [])
        .toSorted(
          (a, b) => a.position - b.position || a.entity.createdAt.localeCompare(b.entity.createdAt),
        ),
  });
  // The dropped order, shown until the save has settled.
  const [dropped, setDropped] = useState<string[] | null>(null);
  const views = dropped
    ? stored.toSorted((a, b) => dropped.indexOf(a.entity.id) - dropped.indexOf(b.entity.id))
    : stored;
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderOverviewViews(module, ids),
    // Also puts the list back in the saved order when the reorder was refused.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["views"] });
      setDropped(null);
    },
  });

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = views.map((v) => v.entity.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(ids, from, to);
    setDropped(next);
    reorder.mutate(next);
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="sm"
        tooltip={label}
        isActive={view.kind === target.kind && !activeViewId}
        onClick={() => setView(target)}
        className="pr-8"
      >
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
      <button
        type="button"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        onClick={() => setOpen((v) => !v)}
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <IconChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <SidebarMenuSub>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={views.map((v) => v.entity.id)}
              strategy={verticalListSortingStrategy}
            >
              {views.map((saved) => (
                <ViewRow
                  key={saved.entity.id}
                  view={saved}
                  active={activeViewId === saved.entity.id}
                  onOpen={() => setView(viewTarget(module, saved.entity.spaceId, saved.entity.id))}
                />
              ))}
            </SortableContext>
          </DndContext>
          <SidebarMenuSubItem className="pl-3">
            <SidebarMenuSubButton onClick={() => setDialogOpen(true)}>
              <IconPlus />
              <span className="truncate text-sidebar-foreground/70">New view</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      )}
      <ViewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        spaceId={spaces.find((s) => s.id === activeSpaceId)?.id ?? spaces[0]?.id ?? ""}
        spaces={spaces}
        module={module}
        // A new View starts from the page's own defaults; the page takes it from there.
        config={serializeViewConfig([], {})}
        onSaved={(created) => setView(viewTarget(module, created.spaceId, created.id))}
      />
    </SidebarMenuItem>
  );
}
