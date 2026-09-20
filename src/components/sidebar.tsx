import {
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconLayoutDashboard,
  IconPin,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AddModuleMenu } from "@/components/add-module-menu";
import { IconPicker } from "@/components/icon-picker";
import { ThemeToggle } from "@/components/theme-toggle";
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
  SidebarRail,
} from "@/components/ui/sidebar";
import { listEntities } from "@/lib/api/entities";
import { createSpace, listSpaces, updateSpace } from "@/lib/api/spaces";
import type { Space } from "@/lib/api/types";
import { MODULE_ICONS, MODULE_KEYS, MODULE_LABELS, modulesInUse } from "@/lib/modules";
import { useNavStore } from "@/lib/store/nav";

const SPACE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6"];

export function AppSidebar() {
  const { view, setView, activeSpaceId } = useNavStore();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <SidebarMenu>
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
              tooltip="Search"
              onClick={() => useNavStore.getState().setPaletteOpen(true)}
            >
              <IconSearch />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Spaces</SidebarGroupLabel>
          <SidebarGroupAction title="New Space" onClick={() => setCreateOpen(true)}>
            <IconPlus />
            <span className="sr-only">New Space</span>
          </SidebarGroupAction>
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

      <SidebarRail />

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Sidebar>
  );
}

function SpaceMenuItem({ space, expanded }: { space: Space; expanded: boolean }) {
  const { view, setView, setActiveSpace } = useNavStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", space.id],
    queryFn: () => listEntities(space.id, false),
    enabled: expanded,
  });
  const used = modulesInUse(entities);
  const usedKeys = MODULE_KEYS.filter((k) => used.has(k));
  const unusedKeys = MODULE_KEYS.filter((k) => !used.has(k));

  return (
    <Collapsible
      open={expanded}
      onOpenChange={(open) => setActiveSpace(open ? space.id : null)}
      className="group/space"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={space.name} isActive={expanded} className="pr-12">
            {space.icon ? (
              <span className="shrink-0 text-sm leading-none">{space.icon}</span>
            ) : (
              <IconFolder
                className="text-(--space-color)"
                // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
                // string — `CSSProperties` just doesn't model custom properties.
                style={{ "--space-color": space.color } as CSSProperties}
              />
            )}
            <span className="truncate">{space.name}</span>
            <IconChevronRight className="ml-auto transition-transform group-data-[state=open]/space:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <div className="absolute top-1.5 right-1 flex items-center gap-0.5 opacity-0 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
          <AddModuleMenu
            moduleKeys={unusedKeys}
            onSelect={(key) => setView({ kind: "module", spaceId: space.id, module: key })}
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

          <DropdownMenu>
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
                Space settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CollapsibleContent>
          <SidebarMenuSub>
            {usedKeys.map((moduleKey) => {
              const Icon = MODULE_ICONS[moduleKey];
              const active =
                view.kind === "module" && view.spaceId === space.id && view.module === moduleKey;
              return (
                <SidebarMenuSubItem key={moduleKey}>
                  <SidebarMenuSubButton
                    isActive={active}
                    onClick={() =>
                      setView({ kind: "module", spaceId: space.id, module: moduleKey })
                    }
                  >
                    <Icon />
                    <span>{MODULE_LABELS[moduleKey]}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
            {usedKeys.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-sidebar-foreground/50">No modules yet</p>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>

      <SpaceSettingsDialog space={space} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Collapsible>
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
                {icon ?? (
                  <IconFolder
                    size={15}
                    className="text-(--space-color)"
                    // SAFETY: `--space-color` only ever receives `color`, a plain hex string —
                    // `CSSProperties` just doesn't model custom properties.
                    style={{ "--space-color": color } as CSSProperties}
                  />
                )}
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
                {icon ?? (
                  <IconFolder
                    size={15}
                    className="text-(--space-color)"
                    // SAFETY: `--space-color` only ever receives `color`, a plain hex string —
                    // `CSSProperties` just doesn't model custom properties.
                    style={{ "--space-color": color } as CSSProperties}
                  />
                )}
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
