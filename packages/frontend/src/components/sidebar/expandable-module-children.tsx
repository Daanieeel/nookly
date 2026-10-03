import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { SidebarMenuSubButton, SidebarMenuSubItem } from "@nookly/ui/components/sidebar";
import { serializeViewConfig } from "#/features/views/view-config.ts";
import { ViewDialog } from "#/features/views/ViewDialog.tsx";
import { type SavedView, isViewModule, listViews, reorderViews } from "#/lib/api/views.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { type ModuleKey, useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { qk } from "#/lib/query-keys.ts";
import { reorderedViews } from "./reorder-views.ts";

/// Modules whose row expands to list their saved Views.
export const EXPANDABLE_MODULE_KEYS = new Set<ModuleKey>(["tasks", "assignments"]);

export function ViewRow({
  view,
  active,
  onOpen,
}: {
  view: SavedView;
  active: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.entity.id,
  });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };

  return (
    <SidebarMenuSubItem
      ref={setNodeRef}
      style={dragStyle}
      className={cn("group/view relative pl-3", isDragging && "z-10")}
      {...entityTarget(view.entity)}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label={`Drag to reorder ${displayTitle(view.entity)}`}
        className="absolute top-1/2 left-3 flex size-4 -translate-y-1/2 cursor-grab items-center justify-center text-sidebar-foreground/0 group-hover/view:text-sidebar-foreground/40 active:cursor-grabbing"
      >
        <IconGripVertical size={12} />
      </button>
      <SidebarMenuSubButton isActive={active} onClick={onOpen}>
        <EntityIcon entity={view.entity} size={14} />
        <span className="truncate">{displayTitle(view.entity)}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

export function ExpandableModuleChildren({
  moduleKey,
  spaceId,
  open,
}: {
  moduleKey: ModuleKey;
  spaceId: string;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const activeViewId = useNavStore((s) => (s.view.kind === "module" ? s.view.viewId : undefined));
  const [dialogOpen, setDialogOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const module = isViewModule(moduleKey) ? moduleKey : null;
  const queryKey = qk.views.byModule(spaceId, module);
  const { data: views = [] } = useQuery({
    queryKey,
    queryFn: () => listViews(spaceId, module),
    enabled: open && module !== null,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      module ? reorderViews(spaceId, module, ids) : Promise.resolve(),
    // Also puts the list back in the saved order when the reorder was refused.
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.views.bySpace(spaceId) }),
  });

  if (!open || !module) return null;

  function handleDragEnd(event: DragEndEvent) {
    const next = reorderedViews(views, event);
    if (!next) return;
    queryClient.setQueryData(queryKey, next);
    reorder.mutate(next.map((v) => v.entity.id));
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={views.map((v) => v.entity.id)}
          strategy={verticalListSortingStrategy}
        >
          {views.map((view) => (
            <ViewRow
              key={view.entity.id}
              view={view}
              active={activeViewId === view.entity.id}
              onOpen={() =>
                useNavStore
                  .getState()
                  .setView({ kind: "module", spaceId, module, viewId: view.entity.id })
              }
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
      <ViewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        spaceId={spaceId}
        module={module}
        // A new View starts from the module's own defaults; its page takes it from there.
        config={serializeViewConfig([], {})}
        onSaved={(created) =>
          useNavStore.getState().setView({ kind: "module", spaceId, module, viewId: created.id })
        }
      />
    </>
  );
}
