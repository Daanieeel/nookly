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
  IconAlertTriangle,
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconGripVertical,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconSettings,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { AddModuleMenu } from "#/components/add-module-menu.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { RemoveModuleDialog } from "#/components/sidebar/remove-module-dialog.tsx";
import { EntityMention } from "#/components/entity-mention.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import { LabelsDialog } from "#/components/label-manager.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Button } from "@nookly/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nookly/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Input } from "@nookly/ui/components/input";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@nookly/ui/components/sidebar";
import { listEntities } from "#/lib/api/entities.ts";
import { ACCENT_COLORS } from "#/lib/colors.ts";
import {
  addSpaceModule,
  createSpace,
  deleteSpace,
  listSpaceModules,
  listSpaces,
  reorderSpaceModules,
  reorderSpaces,
  updateSpace,
} from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import {
  MODULE_ICONS,
  MODULE_KEYS,
  MODULE_LABELS,
  MODULE_PASSENGERS,
  type ModuleKey,
} from "#/lib/modules.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  EXPANDABLE_MODULE_KEYS,
  ExpandableModuleChildren,
} from "./sidebar/expandable-module-children";
import { UpdateCard } from "#/components/update-card.tsx";
import { CliInstallCard } from "./sidebar/cli-install-card";
import { ModuleRowMeta } from "./sidebar/module-row-meta";
import { SidebarCustomizeButton, SidebarNavItems } from "./sidebar/sidebar-items";
import { SidebarMascot } from "./sidebar/sidebar-mascot";
import { qk } from "#/lib/query-keys.ts";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { HOTKEYS } from "#/lib/hotkeys.ts";

const SPACE_COLORS = ACCENT_COLORS;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/// The floating preview a Space row shows while it follows the pointer during a drag.
function SpaceDragPreview({ space }: { space: Space }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-sidebar px-2 py-1.5 text-sm shadow-md">
      <span
        className="flex size-4 shrink-0 items-center justify-center text-(--space-color)"
        // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
        // string — `CSSProperties` just doesn't model custom properties.
        style={{ "--space-color": space.color } as CSSProperties}
      >
        {space.icon ? renderIconValue(space.icon, 16) : <IconFolder className="size-4" />}
      </span>
      <span className="truncate">{space.name}</span>
    </div>
  );
}

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

export function AppSidebar() {
  const { view, setView, expandedSpaceIds } = useNavStore();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const spaceSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const reorder = useMutation({
    mutationFn: reorderSpaces,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaces }),
  });

  function handleSpaceDragEnd(event: DragEndEvent) {
    setActiveSpaceId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = spaces.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const nextIds = arrayMove(ids, from, to);
    const byId = new Map(spaces.map((s) => [s.id, s]));
    queryClient.setQueryData<Space[]>(
      ["spaces"],
      nextIds.flatMap((id) => byId.get(id) ?? []),
    );
    reorder.mutate(nextIds);
  }

  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  // Collapsed, the sidebar is gone and the page takes the whole window, like Arc or
  // Zen. Resting the pointer on the left edge slides it back over the page until the
  // pointer leaves it.
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  useAppHotkey(HOTKEYS.toggleSidebar, toggleSidebar);
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    if (!collapsed) setPeeking(false);
  }, [collapsed]);
  const peekOpen = collapsed && peeking;

  return (
    <Sidebar
      collapsible="offcanvas"
      variant="floating"
      className={cn(peekOpen && "left-0! z-30")}
      onMouseLeave={() => {
        // A menu or dialog opened from the sidebar keeps it open while the pointer is in it.
        if (!document.querySelector("[role=menu],[role=dialog],[role=alertdialog]")) {
          setPeeking(false);
        }
      }}
      {...contextTarget("sidebar", { createSpace: () => setCreateOpen(true) })}
    >
      {collapsed && !peeking && (
        <div
          aria-hidden
          onMouseEnter={() => setPeeking(true)}
          className="fixed top-(--titlebar-height,0px) bottom-0 left-0 z-20 w-2"
        />
      )}
      <SidebarHeader>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem className="mb-1">
            <SidebarMascot />
          </SidebarMenuItem>
          <SidebarMenuItem className="mb-2">
            <SidebarCustomizeButton />
          </SidebarMenuItem>
          <SidebarNavItems />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Spaces</SidebarGroupLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarGroupAction onClick={() => setCreateOpen(true)}>
                <IconPlus />
                <span className="sr-only">New Space</span>
              </SidebarGroupAction>
            </TooltipTrigger>
            <TooltipContent side="top">New Space</TooltipContent>
          </Tooltip>
          <SidebarGroupContent>
            <DndContext
              sensors={spaceSensors}
              onDragStart={(e) => setActiveSpaceId(String(e.active.id))}
              onDragEnd={handleSpaceDragEnd}
              onDragCancel={() => setActiveSpaceId(null)}
            >
              <SortableContext
                items={spaces.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <SidebarMenu>
                  {spaces.map((space) => (
                    <SpaceMenuItem
                      key={space.id}
                      space={space}
                      expanded={expandedSpaceIds.includes(space.id)}
                    />
                  ))}
                </SidebarMenu>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeSpace && <SpaceDragPreview space={activeSpace} />}
              </DragOverlay>
            </DndContext>
            {spaces.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                Use "+" to create your first Space
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <CliInstallCard />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UpdateCard className="group-data-[collapsible=icon]:hidden" />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Trash"
              isActive={view.kind === "trash"}
              onClick={() => setView({ kind: "trash" })}
            >
              <IconTrash />
              <span>Trash</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={{
                children: (
                  <span className="flex items-center gap-2">
                    {collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    <KbdGroup>
                      <Kbd>⌘</Kbd>
                      <Kbd>S</Kbd>
                    </KbdGroup>
                  </span>
                ),
              }}
              onClick={toggleSidebar}
            >
              {collapsed ? <IconLayoutSidebarLeftExpand /> : <IconLayoutSidebarLeftCollapse />}
              <span>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
              <KbdGroup className="ml-auto group-data-[collapsible=icon]:hidden">
                <Kbd>⌘</Kbd>
                <Kbd>S</Kbd>
              </KbdGroup>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Sidebar>
  );
}

function SpaceMenuItem({ space, expanded }: { space: Space; expanded: boolean }) {
  const { view, setView, toggleExpandedSpace } = useNavStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: space.id,
  });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Also fetched (not just when expanded) once the delete dialog is open, so its
  // "X items" count isn't stuck at 0 for a Space the user never expanded.
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(space.id),
    queryFn: () => listEntities(space.id, false),
    enabled: expanded || deleteConfirmOpen,
  });
  // Source of truth for which module rows show — intentional/sticky (added via
  // "+" or by creating a first entity), not re-derived from live entity counts
  // (§ sidebar module visibility must not disappear when content is deleted).
  // Also fetched once the "+" menu opens, so an unexpanded row's "already added"
  // list is accurate before it computes `unusedKeys`.
  const { data: addedModules = [] } = useQuery({
    queryKey: qk.spaceModules(space.id),
    queryFn: () => listSpaceModules(space.id),
    enabled: expanded || addModuleOpen,
  });
  const passengerKeys = new Set([...MODULE_PASSENGERS.values()].flat());
  const used = new Set(addedModules);
  // Manually ordered (§ drag-to-reorder), not the fixed `MODULE_KEYS` order.
  const usedKeys = addedModules.filter((k): k is ModuleKey =>
    MODULE_KEYS.some((known) => known === k),
  );
  const unusedKeys = MODULE_KEYS.filter((k) => !used.has(k) && !passengerKeys.has(k));
  const [activeModuleKey, setActiveModuleKey] = useState<ModuleKey | null>(null);
  const moduleSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const reorderModules = useMutation({
    mutationFn: (keys: string[]) => reorderSpaceModules(space.id, keys),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaceModules(space.id) }),
  });

  function handleModuleDragEnd(event: DragEndEvent) {
    setActiveModuleKey(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = [...usedKeys];
    // SAFETY: `active.id` comes from this row's own SortableContext, whose `items`
    // is `usedKeys` — every id here is one of this space's module keys.
    const from = keys.indexOf(String(active.id) as ModuleKey);
    // SAFETY: same as above — `over.id` is also one of this SortableContext's ids.
    const to = keys.indexOf(String(over.id) as ModuleKey);
    if (from === -1 || to === -1) return;
    const nextKeys = arrayMove(keys, from, to);
    queryClient.setQueryData(qk.spaceModules(space.id), nextKeys);
    reorderModules.mutate(nextKeys);
  }

  const addModule = useMutation({
    mutationFn: async (key: ModuleKey) => {
      await addSpaceModule(space.id, key);
      for (const passenger of MODULE_PASSENGERS.get(key) ?? []) {
        await addSpaceModule(space.id, passenger);
      }
    },
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: qk.spaceModules(space.id) });
      setView({ kind: "module", spaceId: space.id, module: key });
    },
  });

  const del = useMutation({ mutationFn: () => deleteSpace(space.id) });
  useCloseAfterSuccess(del, () => {
    setDeleteConfirmOpen(false);
    queryClient.invalidateQueries({ queryKey: qk.spaces });
    if ("spaceId" in view && view.spaceId === space.id) setView({ kind: "dashboard" });
  });
  const delStatus = statusOf(del);

  // The hover-revealed "+"/"…" toolbar must stay visible for as long as either
  // popover it opens is open — group-hover/focus-within alone drop out once
  // focus moves into the portaled popover/dropdown content, which lives
  // outside this row's DOM subtree.
  const toolbarForcedVisible = addModuleOpen || menuOpen;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={() => toggleExpandedSpace(space.id)}
      className="group/space"
    >
      <SidebarMenuItem
        ref={setNodeRef}
        style={dragStyle}
        className={cn(isDragging && "z-10")}
        {...contextTarget("space", {
          space,
          expanded,
          toggle: () => toggleExpandedSpace(space.id),
          openSettings: () => setSettingsOpen(true),
          openLabels: () => setLabelsOpen(true),
        })}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={space.name} className="pr-16">
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <span
                className="flex items-center justify-center text-(--space-color) transition-opacity group-hover/menu-item:opacity-0"
                // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
                // string — `CSSProperties` just doesn't model custom properties.
                style={{ "--space-color": space.color } as CSSProperties}
              >
                {space.icon ? renderIconValue(space.icon, 16) : <IconFolder className="size-4" />}
              </span>
              <IconChevronRight className="absolute inset-0 size-4 opacity-0 transition group-hover/menu-item:opacity-100 group-data-[state=open]/space:rotate-90" />
            </span>
            <span className="truncate">{space.name}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <div
          className={cn(
            "absolute top-1.5 right-1 flex items-center gap-0.5 group-focus-within/menu-item:opacity-100 group-data-[collapsible=icon]:hidden",
            toolbarForcedVisible ? "opacity-100" : "opacity-0 group-hover/menu-item:opacity-100",
          )}
        >
          <button
            type="button"
            {...attributes}
            {...listeners}
            tabIndex={-1}
            aria-label={`Drag to reorder ${space.name}`}
            className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:cursor-grabbing [&>svg]:size-3.5"
          >
            <IconGripVertical />
          </button>
          <AddModuleMenu
            moduleKeys={unusedKeys}
            onSelect={(key) => addModule.mutateAsync(key)}
            onOpenChange={setAddModuleOpen}
            tooltip={`Add module to ${space.name}`}
            trigger={
              <button
                type="button"
                aria-label={`Add module to ${space.name}`}
                onClick={(e) => e.stopPropagation()}
                className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-3.5"
              >
                <IconPlus />
              </button>
            }
          />

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${space.name} settings`}
                onClick={(e) => e.stopPropagation()}
                className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-3.5"
              >
                <IconDotsVertical />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setLabelsOpen(true)}>
                <IconTag className="size-4" />
                Labels
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <IconSettings className="size-4" />
                Space settings
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteConfirmOpen(true)}>
                <IconTrash className="size-4" />
                Delete Space
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CollapsibleContent>
          <DndContext
            sensors={moduleSensors}
            // SAFETY: this context's SortableContext `items` is `usedKeys`, so
            // `active.id` is always one of this space's module keys.
            onDragStart={(e) => setActiveModuleKey(String(e.active.id) as ModuleKey)}
            onDragEnd={handleModuleDragEnd}
            onDragCancel={() => setActiveModuleKey(null)}
          >
            <SortableContext items={usedKeys} strategy={verticalListSortingStrategy}>
              <SidebarMenuSub>
                {usedKeys.map((moduleKey) => {
                  const active =
                    view.kind === "module" &&
                    view.spaceId === space.id &&
                    view.module === moduleKey &&
                    !view.viewId;
                  return (
                    <ModuleSubRow
                      key={moduleKey}
                      space={space}
                      moduleKey={moduleKey}
                      active={active}
                      onNavigate={() =>
                        setView({ kind: "module", spaceId: space.id, module: moduleKey })
                      }
                    />
                  );
                })}
                {usedKeys.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-sidebar-foreground/50">No modules yet</p>
                )}
              </SidebarMenuSub>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeModuleKey && <ModuleDragPreview moduleKey={activeModuleKey} />}
            </DragOverlay>
          </DndContext>
        </CollapsibleContent>
      </SidebarMenuItem>

      <SpaceSettingsDialog space={space} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <LabelsDialog
        spaceId={space.id}
        spaceName={space.name}
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
      />

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open && !del.isSuccess) del.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
              <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
              Delete
              <EntityMention
                icon={space.icon ? renderIconValue(space.icon, 13) : <IconFolder size={13} />}
                label={space.name}
              />
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the Space and everything in it,{" "}
              {plural(entities.length, "item")} across its modules. This cannot be undone; nothing
              goes to Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (delStatus === "idle" || delStatus === "error") del.mutate();
              }}
            >
              <StatusButtonContent
                status={delStatus}
                label="Delete Space"
                successLabel="Space deleted"
                errorLabel="Couldn't delete, try again"
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}

function ModuleSubRow({
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
      <SidebarMenuSubItem
        ref={setNodeRef}
        style={dragStyle}
        className={cn("group/module relative", isDragging && "z-10")}
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
          className="absolute top-1/2 left-0.5 flex size-4 -translate-y-1/2 cursor-grab items-center justify-center text-sidebar-foreground/0 group-hover/module:text-sidebar-foreground/40 active:cursor-grabbing"
        >
          <IconGripVertical size={12} />
        </button>
        <SidebarMenuSubButton
          isActive={active}
          onClick={onNavigate}
          className={expandable ? "pr-6" : undefined}
        >
          <Icon />
          <span className="truncate">{MODULE_LABELS[moduleKey]}</span>
          <ModuleRowMeta moduleKey={moduleKey} spaceId={space.id} />
        </SidebarMenuSubButton>
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
      </SidebarMenuSubItem>
      <ExpandableModuleChildren moduleKey={moduleKey} spaceId={space.id} open={childrenOpen} />
      <RemoveModuleDialog
        spaceId={space.id}
        module={moduleKey}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
      />
    </>
  );
}

const spaceSchema = z.object({
  name: z.string().trim().min(1, "Give the space a name"),
  color: z.string(),
  icon: z.string().nullable(),
});
type SpaceValues = z.infer<typeof spaceSchema>;

function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const setActiveSpace = useNavStore((s) => s.setActiveSpace);
  const toggleExpandedSpace = useNavStore((s) => s.toggleExpandedSpace);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const emptySpace: SpaceValues = { name: "", color: SPACE_COLORS[0], icon: null };
  const form = useForm({
    defaultValues: emptySpace,
    validators: { onChange: spaceSchema },
    onSubmit: ({ value }) => {
      if (createStatus === "idle" || createStatus === "error") create.mutate(value);
    },
  });

  useEffect(() => {
    if (open) nameInputRef.current?.focus();
    else form.reset();
  }, [open, form]);

  const create = useMutation({
    mutationFn: ({ name, icon, color }: SpaceValues) => createSpace(name.trim(), icon, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaces }),
  });
  useCloseAfterSuccess(create, () => {
    if (create.data) {
      setActiveSpace(create.data.id);
      toggleExpandedSpace(create.data.id);
    }
    onOpenChange(false);
  });
  const createStatus = statusOf(create);
  const { reset: resetCreate } = create;
  useEffect(() => {
    if (!open) resetCreate();
  }, [open, resetCreate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Space</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <form.Field name="icon">
            {(iconField) => (
              <FormField label="Icon">
                <form.Subscribe selector={(state) => state.values.color}>
                  {(color) => (
                    <IconPicker
                      value={iconField.state.value}
                      onChange={iconField.handleChange}
                      trigger={
                        <button
                          type="button"
                          aria-label="Choose Space icon"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-accent text-base hover:bg-accent/80"
                        >
                          <span
                            className="text-(--space-color)"
                            // SAFETY: `--space-color` only ever receives `color`, a plain hex string —
                            // `CSSProperties` just doesn't model custom properties.
                            style={{ "--space-color": color } as CSSProperties}
                          >
                            {iconField.state.value ? (
                              renderIconValue(iconField.state.value, 15)
                            ) : (
                              <IconFolder size={15} />
                            )}
                          </span>
                        </button>
                      }
                    />
                  )}
                </form.Subscribe>
              </FormField>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <FormField label="Name" required htmlFor="new-space-name" error={fieldMessage(field)}>
                <Input
                  id="new-space-name"
                  ref={nameInputRef}
                  placeholder="e.g. University"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormField>
            )}
          </form.Field>
        </div>
        <form.Field name="color">
          {(field) => (
            <FormField label="Color">
              <div className="flex flex-wrap gap-2">
                {SPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Space color ${c}`}
                    onClick={() => field.handleChange(c)}
                    className={`size-6 rounded-full bg-(--swatch-color) ${field.state.value === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
                    // SAFETY: `--swatch-color` only ever receives `c`, a plain hex string from
                    // `SPACE_COLORS` — `CSSProperties` just doesn't model custom properties.
                    style={{ "--swatch-color": c } as CSSProperties}
                  />
                ))}
              </div>
            </FormField>
          )}
        </form.Field>
        <DialogFooter>
          <form.Subscribe selector={hasVisibleErrors}>
            {(blocked) => (
              <Button disabled={blocked} onClick={() => void form.handleSubmit()}>
                <StatusButtonContent
                  status={createStatus}
                  label="Create"
                  successLabel="Space created"
                  errorLabel="Couldn't create, try again"
                />
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpaceSettingsDialog({
  space,
  open,
  onOpenChange,
}: {
  space: Space;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const current: SpaceValues = { name: space.name, color: space.color, icon: space.icon };
  const form = useForm({
    defaultValues: current,
    validators: { onChange: spaceSchema },
    onSubmit: ({ value }) => {
      if (saveStatus === "idle" || saveStatus === "error") save.mutate(value);
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: space.name, color: space.color, icon: space.icon });
      nameInputRef.current?.focus();
    }
  }, [open, space, form]);

  const save = useMutation({
    mutationFn: ({ name, icon, color }: SpaceValues) =>
      updateSpace(space.id, { name: name.trim(), icon: icon ?? "", color }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaces }),
  });
  useCloseAfterSuccess(save, () => onOpenChange(false));
  const saveStatus = statusOf(save);
  const { reset: resetSave } = save;
  useEffect(() => {
    if (!open) resetSave();
  }, [open, resetSave]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Space settings</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <form.Field name="icon">
            {(iconField) => (
              <FormField label="Icon">
                <form.Subscribe selector={(state) => state.values.color}>
                  {(color) => (
                    <IconPicker
                      value={iconField.state.value}
                      onChange={iconField.handleChange}
                      trigger={
                        <button
                          type="button"
                          aria-label="Choose Space icon"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-accent text-base hover:bg-accent/80"
                        >
                          <span
                            className="text-(--space-color)"
                            // SAFETY: `--space-color` only ever receives `color`, a plain hex string —
                            // `CSSProperties` just doesn't model custom properties.
                            style={{ "--space-color": color } as CSSProperties}
                          >
                            {iconField.state.value ? (
                              renderIconValue(iconField.state.value, 15)
                            ) : (
                              <IconFolder size={15} />
                            )}
                          </span>
                        </button>
                      }
                    />
                  )}
                </form.Subscribe>
              </FormField>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <FormField
                label="Name"
                required
                htmlFor="space-settings-name"
                error={fieldMessage(field)}
              >
                <Input
                  id="space-settings-name"
                  ref={nameInputRef}
                  placeholder="e.g. University"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormField>
            )}
          </form.Field>
        </div>
        <form.Field name="color">
          {(field) => (
            <FormField label="Color">
              <div className="flex flex-wrap gap-2">
                {SPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Space color ${c}`}
                    onClick={() => field.handleChange(c)}
                    className={`size-6 rounded-full bg-(--swatch-color) ${field.state.value === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
                    // SAFETY: `--swatch-color` only ever receives `c`, a plain hex string from
                    // `SPACE_COLORS` — `CSSProperties` just doesn't model custom properties.
                    style={{ "--swatch-color": c } as CSSProperties}
                  />
                ))}
              </div>
            </FormField>
          )}
        </form.Field>
        <DialogFooter>
          <form.Subscribe selector={hasVisibleErrors}>
            {(blocked) => (
              <Button disabled={blocked} onClick={() => void form.handleSubmit()}>
                <StatusButtonContent
                  status={saveStatus}
                  label="Save"
                  successLabel="Saved"
                  errorLabel="Couldn't save, try again"
                />
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
