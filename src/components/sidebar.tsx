import {
  IconAlertTriangle,
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconHistory,
  IconLayoutDashboard,
  IconPin,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AddModuleMenu } from "@/components/add-module-menu";
import { renderIconValue } from "@/components/entity-icon";
import { EntityMention } from "@/components/entity-mention";
import { IconPicker } from "@/components/icon-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
} from "@/components/ui/sidebar";
import { listEntities } from "@/lib/api/entities";
import {
  addSpaceModule,
  createSpace,
  deleteSpace,
  listSpaceModules,
  listSpaces,
  updateSpace,
} from "@/lib/api/spaces";
import type { Space } from "@/lib/api/types";
import {
  MODULE_ICONS,
  MODULE_KEYS,
  MODULE_LABELS,
  MODULE_PASSENGERS,
  type ModuleKey,
} from "@/lib/modules";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import {
  EXPANDABLE_MODULE_KEYS,
  ExpandableModuleChildren,
} from "./sidebar/expandable-module-children";
import { CliInstallCard } from "./sidebar/cli-install-card";
import { ModuleRowMeta } from "./sidebar/module-row-meta";
import { QuickJotTrigger } from "./sidebar/quick-jot-trigger";
import { SidebarMascot } from "./sidebar/sidebar-mascot";

const SPACE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6"];

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function AppSidebar() {
  const { view, setView, activeSpaceId } = useNavStore();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  return (
    <Sidebar collapsible="icon" variant="floating">
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
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Recents"
              isActive={view.kind === "recents"}
              onClick={() => setView({ kind: "recents" })}
            >
              <IconHistory />
              <span>Recents</span>
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
                <SpaceMenuItem key={space.id} space={space} expanded={activeSpaceId === space.id} />
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
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Sidebar>
  );
}

function SpaceMenuItem({ space, expanded }: { space: Space; expanded: boolean }) {
  const { view, setView, setActiveSpace } = useNavStore();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const usedKeys = MODULE_KEYS.filter((k) => used.has(k));
  const unusedKeys = MODULE_KEYS.filter((k) => !used.has(k) && !passengerKeys.has(k));

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

  const del = useMutation({
    mutationFn: () => deleteSpace(space.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      if ("spaceId" in view && view.spaceId === space.id) setView({ kind: "dashboard" });
      setDeleteConfirmOpen(false);
    },
  });

  // The hover-revealed "+"/"…" toolbar must stay visible for as long as either
  // popover it opens is open — group-hover/focus-within alone drop out once
  // focus moves into the portaled popover/dropdown content, which lives
  // outside this row's DOM subtree.
  const toolbarForcedVisible = addModuleOpen || menuOpen;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={(open) => setActiveSpace(open ? space.id : null)}
      className="group/space"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={space.name} className="pr-12">
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
          <AddModuleMenu
            moduleKeys={unusedKeys}
            onSelect={(key) => addModule.mutate(key)}
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
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
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                del.mutate();
              }}
            >
              Delete Space
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
  const [childrenOpen, setChildrenOpen] = useState(false);
  const expandable = EXPANDABLE_MODULE_KEYS.has(moduleKey);

  return (
    <>
      <SidebarMenuSubItem className="relative">
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
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setActiveSpace(space.id);
      onOpenChange(false);
    },
  });

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
        <div className="flex gap-2">
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
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            Create
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      onOpenChange(false);
    },
  });

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
        <div className="flex gap-2">
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
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
