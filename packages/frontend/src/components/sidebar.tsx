import {
  IconAlertTriangle,
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconGripVertical,
  IconLayoutDashboard,
  IconPin,
  IconPlus,
  IconSettings,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { AddModuleMenu } from "#/components/add-module-menu.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { EntityMention } from "#/components/entity-mention.tsx";
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
import { QuickJotTrigger } from "./sidebar/quick-jot-trigger";
import { SidebarMascot } from "./sidebar/sidebar-mascot";

const SPACE_COLORS = ACCENT_COLORS;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function AppSidebar() {
  const { view, setView, expandedSpaceIds } = useNavStore();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const [draggedSpaceId, setDraggedSpaceId] = useState<string | null>(null);
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null);
  const reorder = useMutation({
    mutationFn: reorderSpaces,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
  });

  function dropSpace(targetId: string) {
    const draggedId = draggedSpaceId;
    setDraggedSpaceId(null);
    setDragOverSpaceId(null);
    if (!draggedId || draggedId === targetId) return;
    const ids = spaces.map((s) => s.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggedId);
    const byId = new Map(spaces.map((s) => [s.id, s]));
    queryClient.setQueryData<Space[]>(
      ["spaces"],
      ids.flatMap((id) => byId.get(id) ?? []),
    );
    reorder.mutate(ids);
  }

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      {...contextTarget("sidebar", { createSpace: () => setCreateOpen(true) })}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="mb-4">
            <SidebarMascot />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Dashboard"
              isActive={view.kind === "dashboard"}
              onClick={() => setView({ kind: "dashboard" })}
            >
              <IconLayoutDashboard />
              <span>Dashboard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Pinned"
              isActive={view.kind === "pinned"}
              onClick={() => setView({ kind: "pinned" })}
            >
              <IconPin />
              <span>Pinned</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <QuickJotTrigger />
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
            <SidebarMenu>
              {spaces.map((space) => (
                <SpaceMenuItem
                  key={space.id}
                  space={space}
                  expanded={expandedSpaceIds.includes(space.id)}
                  dragOver={dragOverSpaceId === space.id && draggedSpaceId !== space.id}
                  onDragHandleStart={() => setDraggedSpaceId(space.id)}
                  onDragHandleEnd={() => {
                    setDraggedSpaceId(null);
                    setDragOverSpaceId(null);
                  }}
                  onDragOverRow={() => draggedSpaceId && setDragOverSpaceId(space.id)}
                  onDropRow={() => dropSpace(space.id)}
                />
              ))}
            </SidebarMenu>
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
        </SidebarMenu>
      </SidebarFooter>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Sidebar>
  );
}

function SpaceMenuItem({
  space,
  expanded,
  dragOver,
  onDragHandleStart,
  onDragHandleEnd,
  onDragOverRow,
  onDropRow,
}: {
  space: Space;
  expanded: boolean;
  /// True while another Space is being dragged over this row, to show a drop indicator.
  dragOver: boolean;
  onDragHandleStart: () => void;
  onDragHandleEnd: () => void;
  onDragOverRow: () => void;
  onDropRow: () => void;
}) {
  const { view, setView, toggleExpandedSpace } = useNavStore();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Also fetched (not just when expanded) once the delete dialog is open, so its
  // "X items" count isn't stuck at 0 for a Space the user never expanded.
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", space.id],
    queryFn: () => listEntities(space.id, false),
    enabled: expanded || deleteConfirmOpen,
  });
  // Source of truth for which module rows show — intentional/sticky (added via
  // "+" or by creating a first entity), not re-derived from live entity counts
  // (§ sidebar module visibility must not disappear when content is deleted).
  // Also fetched once the "+" menu opens, so an unexpanded row's "already added"
  // list is accurate before it computes `unusedKeys`.
  const { data: addedModules = [] } = useQuery({
    queryKey: ["space-modules", space.id],
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
  const [draggedModuleKey, setDraggedModuleKey] = useState<ModuleKey | null>(null);
  const [dragOverModuleKey, setDragOverModuleKey] = useState<ModuleKey | null>(null);
  const reorderModules = useMutation({
    mutationFn: (keys: string[]) => reorderSpaceModules(space.id, keys),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["space-modules", space.id] }),
  });

  function dropModule(targetKey: ModuleKey) {
    const draggedKey = draggedModuleKey;
    setDraggedModuleKey(null);
    setDragOverModuleKey(null);
    if (!draggedKey || draggedKey === targetKey) return;
    const keys = [...usedKeys];
    const from = keys.indexOf(draggedKey);
    const to = keys.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    keys.splice(from, 1);
    keys.splice(to, 0, draggedKey);
    queryClient.setQueryData(["space-modules", space.id], keys);
    reorderModules.mutate(keys);
  }

  const addModule = useMutation({
    mutationFn: async (key: ModuleKey) => {
      await addSpaceModule(space.id, key);
      for (const passenger of MODULE_PASSENGERS.get(key) ?? []) {
        await addSpaceModule(space.id, passenger);
      }
    },
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: ["space-modules", space.id] });
      setView({ kind: "module", spaceId: space.id, module: key });
    },
  });

  const del = useMutation({ mutationFn: () => deleteSpace(space.id) });
  useCloseAfterSuccess(del, () => {
    setDeleteConfirmOpen(false);
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
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
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverRow();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropRow();
        }}
        {...contextTarget("space", {
          space,
          expanded,
          toggle: () => toggleExpandedSpace(space.id),
          openSettings: () => setSettingsOpen(true),
          openLabels: () => setLabelsOpen(true),
        })}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-x-1 -top-px z-10 h-0.5 rounded-full bg-primary" />
        )}
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
            tabIndex={-1}
            aria-label={`Drag to reorder ${space.name}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              onDragHandleStart();
            }}
            onDragEnd={onDragHandleEnd}
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
          <SidebarMenuSub>
            {usedKeys.map((moduleKey) => {
              const active =
                view.kind === "module" && view.spaceId === space.id && view.module === moduleKey;
              return (
                <ModuleSubRow
                  key={moduleKey}
                  space={space}
                  moduleKey={moduleKey}
                  active={active}
                  onNavigate={() =>
                    setView({ kind: "module", spaceId: space.id, module: moduleKey })
                  }
                  dragOver={dragOverModuleKey === moduleKey && draggedModuleKey !== moduleKey}
                  onDragHandleStart={() => setDraggedModuleKey(moduleKey)}
                  onDragHandleEnd={() => {
                    setDraggedModuleKey(null);
                    setDragOverModuleKey(null);
                  }}
                  onDragOverRow={() => draggedModuleKey && setDragOverModuleKey(moduleKey)}
                  onDropRow={() => dropModule(moduleKey)}
                />
              );
            })}
            {usedKeys.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-sidebar-foreground/50">No modules yet</p>
            )}
          </SidebarMenuSub>
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
  dragOver,
  onDragHandleStart,
  onDragHandleEnd,
  onDragOverRow,
  onDropRow,
}: {
  space: Space;
  moduleKey: ModuleKey;
  active: boolean;
  onNavigate: () => void;
  /// True while another module row is being dragged over this one.
  dragOver: boolean;
  onDragHandleStart: () => void;
  onDragHandleEnd: () => void;
  onDragOverRow: () => void;
  onDropRow: () => void;
}) {
  const Icon = MODULE_ICONS[moduleKey];
  const [childrenOpen, setChildrenOpen] = useState(false);
  const expandable = EXPANDABLE_MODULE_KEYS.has(moduleKey);

  return (
    <>
      <SidebarMenuSubItem
        className="group/module relative"
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverRow();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropRow();
        }}
        {...contextTarget("space-module", { spaceId: space.id, module: moduleKey })}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-x-1 -top-px z-10 h-0.5 rounded-full bg-primary" />
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Drag to reorder ${MODULE_LABELS[moduleKey]}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragHandleStart();
          }}
          onDragEnd={onDragHandleEnd}
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
    </>
  );
}

function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const setActiveSpace = useNavStore((s) => s.setActiveSpace);
  const toggleExpandedSpace = useNavStore((s) => s.toggleExpandedSpace);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameInputRef.current?.focus();
    else {
      setName("");
      setColor(SPACE_COLORS[0]);
      setIcon(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => createSpace(name.trim(), icon, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
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
        <div className="flex items-center gap-2">
          <IconPicker
            value={icon}
            onChange={setIcon}
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
                  {icon ? renderIconValue(icon, 15) : <IconFolder size={15} />}
                </span>
              </button>
            }
          />
          <Input
            ref={nameInputRef}
            placeholder="Space name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Space color ${c}`}
              onClick={() => setColor(c)}
              className={`size-6 rounded-full bg-(--swatch-color) ${color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
              // SAFETY: `--swatch-color` only ever receives `c`, a plain hex string from
              // `SPACE_COLORS` — `CSSProperties` just doesn't model custom properties.
              style={{ "--swatch-color": c } as CSSProperties}
            />
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={() => (createStatus === "idle" || createStatus === "error") && create.mutate()}
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Space created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
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
  const [name, setName] = useState(space.name);
  const [color, setColor] = useState(space.color);
  const [icon, setIcon] = useState<string | null>(space.icon);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(space.name);
      setColor(space.color);
      setIcon(space.icon);
      nameInputRef.current?.focus();
    }
  }, [open, space]);

  const save = useMutation({
    mutationFn: () => updateSpace(space.id, { name: name.trim(), icon: icon ?? "", color }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
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
        <div className="flex items-center gap-2">
          <IconPicker
            value={icon}
            onChange={setIcon}
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
                  {icon ? renderIconValue(icon, 15) : <IconFolder size={15} />}
                </span>
              </button>
            }
          />
          <Input
            ref={nameInputRef}
            placeholder="Space name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Space color ${c}`}
              onClick={() => setColor(c)}
              className={`size-6 rounded-full bg-(--swatch-color) ${color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
              // SAFETY: `--swatch-color` only ever receives `c`, a plain hex string from
              // `SPACE_COLORS` — `CSSProperties` just doesn't model custom properties.
              style={{ "--swatch-color": c } as CSSProperties}
            />
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={() => (saveStatus === "idle" || saveStatus === "error") && save.mutate()}
          >
            <StatusButtonContent
              status={saveStatus}
              label="Save"
              successLabel="Saved"
              errorLabel="Couldn't save, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
