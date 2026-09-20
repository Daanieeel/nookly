import {
  IconBook2,
  IconBookmark,
  IconCalendarStats,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconFile,
  IconLayoutDashboard,
  IconNotes,
  IconPin,
  IconPlus,
  IconSearch,
  IconTrash,
  IconWriting,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createSpace, listSpaces } from "@/lib/api/spaces";
import type { Space } from "@/lib/api/types";
import { type ModuleKey, useNavStore } from "@/lib/store/nav";

const MODULE_LABELS = {
  tasks: "Tasks",
  notes: "Notes",
  jots: "Jots & Refinements",
  courses: "Courses",
  sessions: "Sessions",
  exams: "Exams",
  assignments: "Assignments",
  files: "Files",
  bookmarks: "Bookmarks",
} satisfies Record<ModuleKey, string>;

const MODULE_ICONS = {
  tasks: IconChecklist,
  notes: IconNotes,
  jots: IconWriting,
  courses: IconBook2,
  sessions: IconChalkboard,
  exams: IconCalendarStats,
  assignments: IconClipboardList,
  files: IconFile,
  bookmarks: IconBookmark,
} satisfies Record<ModuleKey, typeof IconChecklist>;

/// Grouped, not one flat list of nine identical rows (§1.3 — the sidebar should
/// feel designed for what it shows, not a generic nav list).
const MODULE_GROUPS: { label: string; keys: ModuleKey[] }[] = [
  { label: "Personal", keys: ["tasks", "notes", "jots"] },
  { label: "Study", keys: ["courses", "sessions", "exams", "assignments"] },
  { label: "Library", keys: ["files", "bookmarks"] },
];

const SPACE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6"];

export function Sidebar() {
  const { view, setView, activeSpaceId } = useNavStore();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-md">
      <div className="flex flex-col gap-0.5 p-2">
        <NavButton
          icon={<IconLayoutDashboard size={15} />}
          label="Dashboard"
          active={view.kind === "dashboard"}
          onClick={() => setView({ kind: "dashboard" })}
        />
        <NavButton
          icon={<IconPin size={15} />}
          label="Pinned"
          active={view.kind === "pinned"}
          onClick={() => setView({ kind: "pinned" })}
        />
        <NavButton
          icon={<IconSearch size={15} />}
          label="Search"
          active={false}
          onClick={() => useNavStore.getState().setPaletteOpen(true)}
        />
      </div>

      <div className="mx-2 border-t border-border" />

      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-medium text-muted-foreground">Spaces</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <IconPlus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>New Space</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {spaces.map((space) => (
          <SpaceSection key={space.id} space={space} expanded={activeSpaceId === space.id} />
        ))}
        {spaces.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Use "+" to create your first Space
          </p>
        )}
      </div>

      <div className="border-t border-border p-2">
        <ThemeToggle />
      </div>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </aside>
  );
}

function SpaceSection({ space, expanded }: { space: Space; expanded: boolean }) {
  const { view, setView, setActiveSpace } = useNavStore();

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setActiveSpace(space.id)}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
      >
        <span
          className="inline-block size-2 shrink-0 rounded-full bg-(--space-color)"
          // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
          style={{ "--space-color": space.color } as CSSProperties}
        />
        <span className="truncate">
          {space.icon ? `${space.icon} ` : ""}
          {space.name}
        </span>
      </button>

      {expanded && (
        <div className="mb-1 ml-4 flex flex-col border-l border-border pl-2">
          {MODULE_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5 pt-2 first:pt-0.5">
              <span className="px-2 text-xs font-medium text-muted-foreground/70">
                {group.label}
              </span>
              {group.keys.map((moduleKey) => {
                const Icon = MODULE_ICONS[moduleKey];
                const active =
                  view.kind === "module" && view.spaceId === space.id && view.module === moduleKey;
                return (
                  <NavButton
                    key={moduleKey}
                    icon={<Icon size={14} />}
                    label={MODULE_LABELS[moduleKey]}
                    active={active}
                    tint={active ? undefined : space.color}
                    onClick={() =>
                      setView({ kind: "module", spaceId: space.id, module: moduleKey })
                    }
                    dense
                  />
                );
              })}
            </div>
          ))}
          <div className="mt-2 border-t border-border pt-1">
            <NavButton
              icon={<IconTrash size={14} />}
              label="Trash"
              active={view.kind === "trash" && view.spaceId === space.id}
              onClick={() => setView({ kind: "trash", spaceId: space.id })}
              dense
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
  dense,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  dense?: boolean;
  /// Faint per-Space icon tint (§4.1/§9 — the Space's color bleeds beyond just its own row).
  tint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-accent ${
        dense ? "py-1 text-xs text-muted-foreground" : "py-1.5 text-sm font-medium"
      } ${active ? "bg-accent text-foreground" : ""}`}
    >
      <span
        // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
        style={tint ? ({ "--icon-tint": tint } as CSSProperties) : undefined}
        className={tint ? "text-(--icon-tint) opacity-70" : undefined}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
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
  const setActiveSpace = useNavStore((s) => s.setActiveSpace);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameInputRef.current?.focus();
  }, [open]);

  const create = useMutation({
    mutationFn: () => createSpace(name.trim(), null, color),
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setActiveSpace(space.id);
      setName("");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Space</DialogTitle>
        </DialogHeader>
        <Input
          ref={nameInputRef}
          placeholder="Space name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          {SPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`size-6 rounded-full bg-(--swatch-color) ${color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
              // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
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
