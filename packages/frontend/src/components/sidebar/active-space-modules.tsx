import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconChevronRight,
  IconDotsVertical,
  IconGripVertical,
  IconSettings,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@nookly/ui/components/sidebar";
import { RemoveModuleDialog } from "#/components/sidebar/remove-module-dialog.tsx";
import { reorderSpaceModules } from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import { MODULE_ICONS, MODULE_LABELS, type ModuleKey } from "#/lib/modules.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { ExpandableModuleChildren, EXPANDABLE_MODULE_KEYS } from "./expandable-module-children";
import { ModuleRowMeta } from "./module-row-meta";
import { SpaceIcon } from "./space-icon";
import type { SpaceDialog } from "./space-dialogs";
import { useSpaceModules } from "./use-space-modules";

/// The floating preview a module row shows while it follows the pointer during a drag.
function ModuleDragPreview({ moduleKey }: { moduleKey: ModuleKey }) {
  const Icon = MODULE_ICONS[moduleKey];
  return (
    <div className="flex items-center gap-2 rounded-md border bg-sidebar px-2 py-1.5 text-sm shadow-md">
      <Icon className="size-4" />
      <span className="truncate">{MODULE_LABELS[moduleKey]}</span>
    </div>
  );
}

/// The modules of the Space the sidebar shows, as a flat list, no folders.
export function ActiveSpaceModules({ space }: { space: Space }) {
  const queryClient = useQueryClient();
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  const { usedKeys } = useSpaceModules(space);
  const [activeModuleKey, setActiveModuleKey] = useState<ModuleKey | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const reorderModules = useMutation({
    mutationFn: (keys: string[]) => reorderSpaceModules(space.id, keys),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaceModules(space.id) }),
  });

  function handleModuleDragEnd(event: DragEndEvent) {
    setActiveModuleKey(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = usedKeys.findIndex((k) => k === active.id);
    const to = usedKeys.findIndex((k) => k === over.id);
    if (from === -1 || to === -1) return;
    const nextKeys = arrayMove(usedKeys, from, to);
    queryClient.setQueryData(qk.spaceModules(space.id), nextKeys);
    reorderModules.mutate(nextKeys);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveModuleKey(usedKeys.find((k) => k === e.active.id) ?? null)}
      onDragEnd={handleModuleDragEnd}
      onDragCancel={() => setActiveModuleKey(null)}
    >
      <SortableContext items={usedKeys} strategy={verticalListSortingStrategy}>
        <SidebarMenu>
          {usedKeys.map((moduleKey) => (
            <ModuleRow
              key={moduleKey}
              space={space}
              moduleKey={moduleKey}
              active={
                view.kind === "module" &&
                view.spaceId === space.id &&
                view.module === moduleKey &&
                !view.viewId
              }
              onNavigate={() => setView({ kind: "module", spaceId: space.id, module: moduleKey })}
            />
          ))}
          {usedKeys.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-sidebar-foreground/50">
              No modules yet. Use + to add one.
            </li>
          )}
        </SidebarMenu>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeModuleKey && <ModuleDragPreview moduleKey={activeModuleKey} />}
      </DragOverlay>
    </DndContext>
  );
}

/// The Space's name over its modules, with a menu for its settings. Its right click menu
/// is the same one the Space's icon in the bottom row has. It sits outside the scrolling list,
/// so it never moves with it, not even when the list is pulled past its end.
export function SpaceHeader({
  space,
  onOpenDialog,
}: {
  space: Space;
  onOpenDialog: (dialog: SpaceDialog) => void;
}) {
  return (
    <div
      className="group/space-header flex h-7 items-center gap-2 px-2 text-xs font-medium text-sidebar-foreground/70"
      {...contextTarget("space", {
        space,
        openSettings: () => onOpenDialog({ kind: "settings", space }),
        openLabels: () => onOpenDialog({ kind: "labels", space }),
        openDelete: () => onOpenDialog({ kind: "delete", space }),
      })}
    >
      <SpaceIcon space={space} size={14} />
      <span className="min-w-0 flex-1 truncate">{space.name}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${space.name} settings`}
            className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground opacity-0 group-focus-within/space-header:opacity-100 group-hover/space-header:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:opacity-100 [&>svg]:size-3.5"
          >
            <IconDotsVertical />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onOpenDialog({ kind: "labels", space })}>
            <IconTag className="size-4" />
            Labels
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenDialog({ kind: "settings", space })}>
            <IconSettings className="size-4" />
            Space settings
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onOpenDialog({ kind: "delete", space })}
          >
            <IconTrash className="size-4" />
            Delete Space
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ModuleRow({
  space,
  moduleKey,
  active,
  onNavigate,
}: {
  space: Space;
  moduleKey: ModuleKey;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = MODULE_ICONS[moduleKey];
  const openViewModule = useNavStore(
    (s) =>
      s.view.kind === "module" &&
      s.view.spaceId === space.id &&
      s.view.module === moduleKey &&
      !!s.view.viewId,
  );
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  // Opening a View from anywhere (the palette, Back) reveals it in the sidebar.
  useEffect(() => {
    if (openViewModule) setChildrenOpen(true);
  }, [openViewModule]);
  const expandable = EXPANDABLE_MODULE_KEYS.has(moduleKey);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: moduleKey,
  });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };

  return (
    <>
      <SidebarMenuItem
        ref={setNodeRef}
        style={dragStyle}
        className={cn("group/module", isDragging && "z-10")}
        {...contextTarget("space-module", {
          spaceId: space.id,
          module: moduleKey,
          removeModule: () => setRemoveOpen(true),
        })}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          tabIndex={-1}
          aria-label={`Drag to reorder ${MODULE_LABELS[moduleKey]}`}
          className="absolute top-1/2 left-0.5 z-10 flex size-4 -translate-y-1/2 cursor-grab items-center justify-center text-sidebar-foreground/0 group-hover/module:text-sidebar-foreground/40 active:cursor-grabbing"
        >
          <IconGripVertical size={12} />
        </button>
        <SidebarMenuButton
          tooltip={MODULE_LABELS[moduleKey]}
          isActive={active}
          onClick={onNavigate}
          className={expandable ? "pr-7" : undefined}
        >
          <Icon />
          <span className="truncate">{MODULE_LABELS[moduleKey]}</span>
          <ModuleRowMeta moduleKey={moduleKey} spaceId={space.id} />
        </SidebarMenuButton>
        {expandable && (
          <button
            type="button"
            aria-label={
              childrenOpen
                ? `Collapse ${MODULE_LABELS[moduleKey]}`
                : `Expand ${MODULE_LABELS[moduleKey]}`
            }
            onClick={(e) => {
              e.stopPropagation();
              setChildrenOpen((v) => !v);
            }}
            className="absolute top-1/2 right-1 flex size-4 -translate-y-1/2 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <IconChevronRight
              className={cn("size-3.5 transition-transform", childrenOpen && "rotate-90")}
            />
          </button>
        )}
        {childrenOpen && (
          <SidebarMenuSub>
            <ExpandableModuleChildren moduleKey={moduleKey} spaceId={space.id} open />
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
      <RemoveModuleDialog
        spaceId={space.id}
        module={moduleKey}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
      />
    </>
  );
}
