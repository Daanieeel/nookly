import {
  IconBolt,
  IconCheck,
  IconDeviceDesktop,
  IconHistory,
  IconLayoutDashboard,
  IconLayoutSidebarRight,
  IconMoon,
  IconPin,
  IconSun,
  IconTrash,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "@/components/action-feedback";
import { SpaceGlyph, SpotlightItem } from "@/components/spotlight";
import {
  Command as PickerCommand,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { createCourse } from "@/lib/api/courses";
import { createJot, createNote, createRefinement } from "@/lib/api/notes";
import { listSpaceModules, listSpaces } from "@/lib/api/spaces";
import { createTask } from "@/lib/api/tasks";
import type { Entity, Space } from "@/lib/api/types";
import { MODULE_ICONS, MODULE_KEYS, MODULE_LABELS } from "@/lib/modules";
import { type ModuleKey, useNavStore, type View } from "@/lib/store/nav";
import { type Theme, useThemeStore } from "@/lib/theme";
import { cn } from "@/lib/utils";

/// Entity types simple enough to be created directly from a palette with just a
/// title (§3.2/§9 — "typing task: jumps straight into task creation"). Anything
/// requiring more context (Exam, Assignment, Session, Bookmark, File…) is a jump
/// to that module's own tailored creation surface instead, not a bare title field.
/// Each still goes through its real create_* command (not the bare generic entity
/// insert) since Tasks/Courses also need a matching row in their own table.
interface QuickCreateType {
  type: string;
  label: string;
  create: (spaceId: string, title: string) => Promise<Entity>;
}

const QUICK_CREATE_TYPES: QuickCreateType[] = [
  {
    type: "task",
    label: "Task",
    create: (s, t) => createTask(s, t, null, null).then((r) => r.entity),
  },
  { type: "note", label: "Note", create: createNote },
  { type: "jot", label: "Jot", create: createJot },
  { type: "refinement", label: "Refinement", create: createRefinement },
  { type: "course", label: "Course", create: createCourse },
];

interface QuickCreateMatch extends QuickCreateType {
  title: string;
}

/// Recognizes `task:` / `note:`-style prefixes and a plain `new task …` phrasing,
/// pulling out whatever's typed after the type name as the entity's title.
function matchQuickCreate(trimmed: string): QuickCreateMatch[] {
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const matches: QuickCreateMatch[] = [];
  for (const c of QUICK_CREATE_TYPES) {
    const colonPrefix = `${c.type}:`;
    if (lower.startsWith(colonPrefix)) {
      matches.push({ ...c, title: trimmed.slice(colonPrefix.length).trim() });
      continue;
    }
    if (lower.startsWith("new ")) {
      const rest = trimmed.slice(4);
      const restLower = rest.toLowerCase();
      const labelLower = c.label.toLowerCase();
      if (restLower.startsWith(labelLower)) {
        matches.push({ ...c, title: rest.slice(c.label.length).trim() });
      } else if (rest.length > 0 && labelLower.startsWith(restLower)) {
        matches.push({ ...c, title: "" });
      }
    }
  }
  return matches;
}

/// True when every typed word is the start of some word in `text`, so "new"
/// finds every "New …" action and "go tr" finds "Go to Trash".
function matchesWords(text: string, query: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)));
}

/// Leading glyph for every quick action row, so "create a Task" never reads
/// like "open an existing Task".
function ActionGlyph() {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
      <IconBolt size={12} />
    </span>
  );
}

type PickStatus = "idle" | "pending" | "success" | "error";

/// A command that needs a target Space: its row opens a popover listing
/// Spaces (the active one first and preselected). Arrows and Enter pick one.
function SpacePickerItem({
  id,
  open,
  onOpenChange,
  heading,
  spaces,
  activeSpaceId,
  statusFor,
  errorLabel,
  onPick,
  onRefocus,
  children,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  spaces: Space[];
  activeSpaceId: string | null;
  /// Feedback on the Space row that was picked (e.g. a pending create).
  statusFor: (space: Space) => PickStatus;
  errorLabel: string;
  onPick: (space: Space) => void;
  onRefocus: () => void;
  /// The row's content.
  children: ReactNode;
}) {
  const ordered = [
    ...spaces.filter((s) => s.id === activeSpaceId),
    ...spaces.filter((s) => s.id !== activeSpaceId),
  ];
  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <SpotlightItem value={id} onSelect={() => onOpenChange(true)}>
          {children}
        </SpotlightItem>
      </PopoverAnchor>
      <PopoverContent
        className="w-60"
        side="bottom"
        align="end"
        // Keys handled here must not also move the palette's selection.
        onKeyDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRefocus();
        }}
      >
        <PickerCommand loop>
          <CommandInput placeholder="Pick a Space…" />
          <CommandList className="p-1">
            <CommandEmpty>No Space matches.</CommandEmpty>
            <CommandGroup heading={heading} className="p-0">
              {ordered.map((space) => {
                const status = statusFor(space);
                return (
                  <CommandItem key={space.id} value={space.name} onSelect={() => onPick(space)}>
                    <StatusIcon
                      status={status}
                      size={14}
                      idle={<SpaceGlyph space={space} size={14} />}
                    />
                    <span className={cn("min-w-0 flex-1 truncate", statusTextClass(status))}>
                      {status === "error" ? errorLabel : space.name}
                    </span>
                    {space.id === activeSpaceId && status !== "error" && (
                      <span className="text-xs text-muted-foreground">Current</span>
                    )}
                    <StatusAnnouncer message={status === "error" ? errorLabel : null} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

type Category = "create" | "navigate" | "spaces" | "settings";

const CATEGORY_HEADINGS = {
  create: "Create",
  navigate: "Go to",
  spaces: "Spaces",
  settings: "Settings",
} satisfies Record<Category, string>;

const CATEGORY_ORDER: Category[] = ["create", "navigate", "spaces", "settings"];

interface ActionEntry {
  id: string;
  category: Category;
  /// Everything the action answers to when typed: label plus extra keywords.
  words: string;
  /// Offered in the Cmd+K empty state, before anything is typed.
  suggested?: boolean;
  node: ReactNode;
}

const THEME_OPTIONS: { theme: Theme; label: string; icon: TablerIcon }[] = [
  { theme: "light", label: "Light", icon: IconSun },
  { theme: "dark", label: "Dark", icon: IconMoon },
  { theme: "system", label: "System", icon: IconDeviceDesktop },
];

/// Quick actions shared by Cmd+K (search) and Cmd+Shift+P (commands only):
/// creation, navigation, Space jumps and settings, matched by typed words.
///
/// - `search`: Cmd+K with a query, one "Quick actions" group.
/// - `suggestions`: Cmd+K before typing, a short suggested subset.
/// - `commands`: Cmd+Shift+P, every match grouped by category.
export function QuickActions({
  query,
  mode,
  onDone,
  onRefocus,
}: {
  query: string;
  mode: "search" | "suggestions" | "commands";
  /// Closes the hosting palette once an action ran.
  onDone: () => void;
  /// Hands focus back to the hosting palette's input (after a Space picker).
  onRefocus: () => void;
}) {
  const {
    openEntity,
    setView,
    activeSpaceId,
    view,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
  } = useNavStore();
  const theme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.setTheme);
  const queryClient = useQueryClient();
  const trimmed = query.trim();

  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  // Same keys the sidebar uses, so these are usually already cached.
  const spaceModules = useQueries({
    queries: spaces.map((space) => ({
      queryKey: ["space-modules", space.id],
      queryFn: () => listSpaceModules(space.id),
    })),
  });
  const modulesBySpace = new Map(spaces.map((s, i) => [s.id, spaceModules[i]?.data ?? []]));
  /// Which entry's Space picker is open, if any.
  const [picking, setPicking] = useState<string | null>(null);

  const quickCreate = useMutation({
    mutationFn: ({ match, space }: { match: QuickCreateMatch; space: Space }) =>
      match.create(space.id, match.title || `Untitled ${match.label}`),
    onSuccess: (entity) => {
      // Invalidate every cached list keyed by this Space (["entities", id], ["tasks", id],
      // ["courses", id], …) rather than guessing which one this entity type feeds.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.includes(entity.spaceId),
      });
      queryClient.invalidateQueries({ queryKey: ["entities", "all"] });
      openEntity(entity.id, entity.spaceId);
      onDone();
    },
  });

  /// There's no Space home view, so "Go to" lands on the Space's first module.
  const goToSpace = useMutation({
    mutationFn: async (space: Space) => {
      const modules = await listSpaceModules(space.id);
      return { space, module: MODULE_KEYS.find((m) => modules.includes(m)) };
    },
    onSuccess: ({ space, module }) => {
      if (module) setView({ kind: "module", spaceId: space.id, module });
      else useNavStore.getState().setActiveSpace(space.id);
      onDone();
    },
  });

  // A fresh query starts from a clean slate, not a previous attempt's error.
  const { reset: resetQuickCreate } = quickCreate;
  const { reset: resetGoToSpace } = goToSpace;
  useEffect(() => {
    resetQuickCreate();
    resetGoToSpace();
    setPicking(null);
  }, [trimmed, resetQuickCreate, resetGoToSpace]);

  function go(target: View) {
    setView(target);
    onDone();
  }

  function simpleItem(
    id: string,
    icon: TablerIcon,
    label: string,
    run: () => void,
    hint?: ReactNode,
  ) {
    const Icon = icon;
    return (
      <SpotlightItem key={id} value={`action-${id}`} onSelect={run}>
        <ActionGlyph />
        <Icon size={16} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint}
      </SpotlightItem>
    );
  }

  function pickerOpenChange(id: string) {
    return (open: boolean) => {
      setPicking(open ? id : null);
      if (!open) resetQuickCreate();
    };
  }

  function createItem(m: QuickCreateMatch) {
    const id = `create-${m.type}`;
    return (
      <SpacePickerItem
        key={id}
        id={id}
        open={picking === id}
        onOpenChange={pickerOpenChange(id)}
        heading={`New ${m.label} in…`}
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        statusFor={(space) =>
          quickCreate.variables?.match.type === m.type &&
          quickCreate.variables.space.id === space.id
            ? statusOf(quickCreate)
            : "idle"
        }
        errorLabel={`Couldn't create ${m.label}, try again`}
        onPick={(space) => {
          if (!quickCreate.isPending) quickCreate.mutate({ match: m, space });
        }}
        onRefocus={onRefocus}
      >
        <ActionGlyph />
        <span className="min-w-0 flex-1 truncate">
          New {m.label}
          {m.title ? `: ${m.title}` : "…"}
        </span>
      </SpacePickerItem>
    );
  }

  function moduleItem(module: ModuleKey) {
    const id = `module-${module}`;
    const Icon = MODULE_ICONS[module];
    return (
      <SpacePickerItem
        key={id}
        id={id}
        open={picking === id}
        onOpenChange={pickerOpenChange(id)}
        heading={`${MODULE_LABELS[module]} in…`}
        spaces={spaces.filter((s) => modulesBySpace.get(s.id)?.includes(module))}
        activeSpaceId={activeSpaceId}
        statusFor={() => "idle"}
        errorLabel=""
        onPick={(space) => go({ kind: "module", spaceId: space.id, module })}
        onRefocus={onRefocus}
      >
        <ActionGlyph />
        <Icon size={16} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">Go to {MODULE_LABELS[module]}…</span>
      </SpacePickerItem>
    );
  }

  function goToSpaceItem(space: Space) {
    const status = goToSpace.variables?.id === space.id ? statusOf(goToSpace) : "idle";
    const errorLabel = `Couldn't open ${space.name}, try again`;
    return (
      <SpotlightItem
        key={`space-${space.id}`}
        value={`goto-${space.id}`}
        onSelect={() => {
          if (!goToSpace.isPending) goToSpace.mutate(space);
        }}
      >
        <StatusIcon status={status} size={16} idle={<ActionGlyph />} />
        <span className={cn("min-w-0 flex-1 truncate", statusTextClass(status))}>
          {status === "error" ? errorLabel : `Go to ${space.name}`}
        </span>
        <SpaceGlyph space={space} size={14} />
        <StatusAnnouncer message={status === "error" ? errorLabel : null} />
      </SpotlightItem>
    );
  }

  // A typed title ("new task buy milk") wins over the bare "New Task" entry.
  const intents = matchQuickCreate(trimmed);
  const entries: ActionEntry[] = [
    ...(spaces.length > 0
      ? QUICK_CREATE_TYPES.map((c): ActionEntry => {
          const intent = intents.find((m) => m.type === c.type);
          return {
            id: `create-${c.type}`,
            category: "create",
            // An intent already matched, so its words always pass.
            words: intent ? trimmed : `New ${c.label} create add`,
            suggested: c.type === "task" || c.type === "note",
            node: createItem(intent ?? { ...c, title: "" }),
          };
        })
      : []),
    ...[
      { id: "dashboard", icon: IconLayoutDashboard, label: "Dashboard", keywords: "home overview" },
      { id: "pinned", icon: IconPin, label: "Pinned", keywords: "favorites" },
      { id: "recents", icon: IconHistory, label: "Recents", keywords: "history recent" },
      { id: "trash", icon: IconTrash, label: "Trash", keywords: "deleted restore bin" },
    ].map((n): ActionEntry => ({
      id: n.id,
      category: "navigate",
      words: `Go to ${n.label} ${n.keywords}`,
      node: simpleItem(n.id, n.icon, `Go to ${n.label}`, () =>
        // SAFETY: `n.id` is one of the four literal non Space views above.
        go({ kind: n.id as "dashboard" | "pinned" | "recents" | "trash" }),
      ),
    })),
    // Only modules at least one Space actually uses.
    ...MODULE_KEYS.filter((m) => [...modulesBySpace.values()].some((mods) => mods.includes(m))).map(
      (module): ActionEntry => ({
        id: `module-${module}`,
        category: "navigate",
        words: `Go to ${MODULE_LABELS[module]} module`,
        node: moduleItem(module),
      }),
    ),
    ...spaces.map((space): ActionEntry => ({
      id: `space-${space.id}`,
      category: "spaces",
      words: `Go to ${space.name} space switch`,
      suggested: space.id !== activeSpaceId,
      node: goToSpaceItem(space),
    })),
    ...THEME_OPTIONS.map((t): ActionEntry => ({
      id: `theme-${t.theme}`,
      category: "settings",
      words: `Theme ${t.label} appearance color mode`,
      node: simpleItem(
        `theme-${t.theme}`,
        t.icon,
        `Theme: ${t.label}`,
        () => {
          applyTheme(t.theme);
          onDone();
        },
        theme === t.theme ? (
          <IconCheck size={14} className="shrink-0 text-muted-foreground" />
        ) : undefined,
      ),
    })),
    ...(view.kind === "entity"
      ? [
          {
            id: "right-sidebar",
            category: "settings" as const,
            words: "Toggle right sidebar panel show hide relationships attachments",
            node: simpleItem(
              "right-sidebar",
              IconLayoutSidebarRight,
              rightSidebarCollapsed ? "Show Right Sidebar" : "Hide Right Sidebar",
              () => {
                setRightSidebarCollapsed(!rightSidebarCollapsed);
                onDone();
              },
            ),
          },
        ]
      : []),
  ];

  const visible = entries.filter((e) => {
    if (mode === "suggestions") return e.suggested;
    if (mode === "commands" && !trimmed) return true;
    return matchesWords(e.words, trimmed);
  });
  if (visible.length === 0) return null;

  if (mode !== "commands") {
    return (
      <Command.Group heading="Quick actions" className={mode === "search" ? "pt-2" : undefined}>
        {visible.map((e) => e.node)}
      </Command.Group>
    );
  }
  return CATEGORY_ORDER.map((category) => {
    const inCategory = visible.filter((e) => e.category === category);
    if (inCategory.length === 0) return null;
    return (
      <Command.Group key={category} heading={CATEGORY_HEADINGS[category]}>
        {inCategory.map((e) => e.node)}
      </Command.Group>
    );
  });
}
