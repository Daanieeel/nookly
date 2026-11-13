import { isSharedSpace } from "@nookly/shared/api";
import { CARD_CLASSES, SIDEBAR_PANEL_CLASSES, sidebarMenuButtonVariants } from "@nookly/ui/classes";
import { spaceRow } from "@nookly/frontend/lib/space-row";
import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import {
  IconCalendarEvent,
  IconChecklist,
  IconClipboardList,
  IconPin,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFeather,
  IconFolderPlus,
  IconLayoutGridAdd,
  IconLayoutDashboard,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react-native";
import { z } from "zod";
import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Space } from "@nookly/shared/data";
import { SpaceIcon } from "./SpaceIcon.tsx";
import {
  useDecks,
  useExams,
  useSpaceModules,
  useSpaces,
  useStatuses,
  useTasks,
  useUnrefinedJots,
  useViews,
} from "../data/queries.ts";
import { tasksFor } from "./dashboard-model.ts";
import { isoWeek, localDay } from "./dates.ts";
import { IconButton } from "../ui/Button.tsx";
import { Glyph } from "../ui/kit/Glyph.tsx";
import { useScheme, useSemanticPair } from "../ui/kit/scheme.ts";
import { type BadgeLook, MODULE_BADGES } from "../ui/kit/symbols.ts";
import { TINT } from "../ui/tokens.ts";
import { Mascot } from "../ui/Mascot.tsx";
import { useMenu } from "../ui/menu.tsx";
import { usePanes } from "../shell/panes.tsx";
import { MIN_TOUCH, TOUCH_ROW } from "../ui/touch.ts";
import { Text } from "../ui/Text.tsx";
import { cn, row, splitText, withState } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { DEFAULT_TOP, type TopId, topSchema, visibleTop } from "./sidebar-top.ts";
import { usePreference } from "../data/preferences.ts";
import { UiIcon } from "../ui/kit/UiIcon.tsx";

/// The top rows' icons: SF Symbols close to the desktop's, its Tabler icons where SF Symbols
/// are not (D51).
const TOP_ICONS = {
  dashboard: { symbol: "square.grid.2x2", fallback: IconLayoutDashboard },
  calendar: { symbol: "calendar", fallback: IconCalendarEvent },
  tasks: { symbol: "checklist", fallback: IconChecklist },
  assignments: { symbol: "doc.text", fallback: IconClipboardList },
  pinned: { symbol: "pin", fallback: IconPin },
  jot: { symbol: "pencil.line", fallback: IconFeather },
} satisfies Record<TopId, Pick<BadgeLook, "symbol" | "fallback">>;

/// A row's icon in the sidebar: muted, in the accent on the page shown now.
function SideIcon({
  look,
  active = false,
}: {
  look: Pick<BadgeLook, "symbol" | "fallback">;
  active?: boolean;
}) {
  const scheme = useScheme();
  const muted = useSemanticPair("secondaryLabel");
  const accent = TINT.blue[scheme];
  return (
    <View style={{ width: 24, alignItems: "center" }}>
      <Glyph
        name={look.symbol}
        fallback={look.fallback}
        size={19}
        color={active ? accent : muted.color}
        hex={active ? accent : muted.hex}
      />
    </View>
  );
}

/// One line of the sidebar: an icon, a name, and the current page lit up.
function NavRow({
  label,
  icon,
  active = false,
  onPress,
  onLongPress,
  trailing,
  indent = 0,
  subtitle,
  accessibilityLabel,
  role = "button",
}: {
  label: string;
  /// `search` for the row that opens Search.
  role?: "button" | "search";
  /// When the visible name alone is ambiguous, like a module's in a Space.
  accessibilityLabel?: string;
  icon: React.ReactNode;
  active?: boolean;
  onPress: () => void;
  /// The item's menu, the desktop's right click.
  onLongPress?: () => void;
  trailing?: React.ReactNode;
  indent?: number;
  subtitle?: string;
}) {
  const theme = useTheme();
  const { box, text } = splitText(
    row(withState(sidebarMenuButtonVariants({ size: "lg" }), { active, state: "closed" })),
  );
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${label}, ${subtitle}` : label)}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={TOUCH_ROW}
      className={cn(box, "h-auto min-h-10 gap-3 py-2", indent > 0 && "pl-8")}
    >
      {icon}
      <View className="flex-1" pointerEvents="none">
        <Text
          numberOfLines={1}
          className={text}
          style={active ? { color: theme.colors.foreground } : undefined}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/// Tasks with a chevron that unfolds the saved views of the cross Space overview.
function TasksRow({
  icon,
  active,
  go,
}: {
  icon: React.ReactNode;
  active: boolean;
  go: (href: Href) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const { data: views = [] } = useViews({ module: "tasks-overview" });
  const Chevron = open ? IconChevronDown : IconChevronRight;
  return (
    <View>
      <NavRow
        label="Tasks"
        active={active}
        icon={icon}
        trailing={
          views.length > 0 ? (
            <IconButton
              label={open ? "Hide Task Views" : "Show Task Views"}
              size="iconSm"
              icon={<Chevron size={16} color={theme.colors.mutedForeground} />}
              onPress={() => setOpen((o) => !o)}
            />
          ) : null
        }
        onPress={() => go("/tasks")}
      />
      {open
        ? views.map((view) => (
            <NavRow
              key={view.entity.id}
              indent={1}
              label={view.entity.title || "Untitled"}
              accessibilityLabel={`${view.entity.title || "Untitled"}, saved view`}
              icon={<UiIcon icon={IconChecklist} size={16} color={theme.colors.mutedForeground} />}
              onPress={() => go(`/tasks?view=${view.entity.id}`)}
            />
          ))
        : null}
    </View>
  );
}

/// The small figure beside a module: the next exam's day, how many decks.
function ModuleMeta({ spaceId, module }: { spaceId: string; module: string }) {
  const { data: exams = [] } = useExams({ spaceId });
  const { data: decks = [] } = useDecks(spaceId);
  const today = localDay();
  let text: string | null = null;
  if (module === "exams") {
    const next = exams
      .filter((e) => e.status !== "done" && e.examDate !== null && e.examDate >= today)
      .map((e) => e.examDate ?? "")
      .sort()[0];
    text = next
      ? new Date(`${next}T00:00:00`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })
      : null;
  } else if (module === "decks" && decks.length > 0) {
    text = String(decks.length);
  }
  return text ? (
    <Text variant="small" tone="muted">
      {text}
    </Text>
  ) : null;
}

/// The card at the top of the sidebar, like the desktop's: the mascot, today's date and
/// week, and one line about what waits, changing every few seconds; tapping it opens the
/// matching list.
function DayCard({ go }: { go: (href: Href) => void }) {
  const inView = usePanes()?.sidebarOpen ?? true;
  const theme = useTheme();
  const { data: tasks = [] } = useTasks(null);
  const { data: statuses = [] } = useStatuses();
  const { data: decks = [] } = useDecks(null);
  const { data: jots = [] } = useUnrefinedJots(50);
  const { data: spaces = [] } = useSpaces();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(timer);
  }, []);
  const today = localDay();
  const due = tasksFor("today", tasks, statuses, today).length;
  const cards = decks.reduce((n, d) => n + d.stats.due + d.stats.learning + d.stats.new, 0);
  const first = spaces[0]?.id;
  const lines: { text: string; href: Href }[] = [
    ...(due > 0
      ? [{ text: `${due} ${due === 1 ? "task" : "tasks"} due or overdue`, href: "/tasks" }]
      : []),
    ...(cards > 0 && first
      ? [
          {
            text: `${cards} ${cards === 1 ? "card" : "cards"} to study`,
            href: `/module/${first}/decks`,
          },
        ]
      : []),
    ...(jots.length > 0 && first
      ? [
          {
            text: `${jots.length} ${jots.length === 1 ? "jot" : "jots"} to refine`,
            href: `/module/${first}/jots`,
          },
        ]
      : []),
  ];
  const now = new Date();
  const line = lines.length > 0 ? lines[tick % lines.length] : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Today, ${line?.text ?? "nothing waiting"}`}
      disabled={!line}
      onPress={() => line && go(line.href)}
      className={cn(CARD_CLASSES, "mx-1 mb-3 flex-row items-center gap-3 p-3 active:opacity-80")}
    >
      {/* A fixed box keeps the card's height to the text; the blob is a little larger. */}
      <View className="size-8 items-center justify-center" pointerEvents="none">
        <Mascot size={44} animate={inView} />
      </View>
      <View className="flex-1 gap-0.5" pointerEvents="none">
        <Text variant="small" tone="muted" numberOfLines={1}>
          {`${now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · Week ${isoWeek(now)}`}
        </Text>
        <Text style={{ color: theme.colors.foreground }} numberOfLines={1}>
          {line?.text ?? "Nothing waiting. Enjoy the calm."}
        </Text>
      </View>
    </Pressable>
  );
}

const spaceLabel = (space: Space) =>
  isSharedSpace(space.id) ? `${space.name}, Shared with you` : space.name;

/// The Space shown: its icon and name over its modules, as the desktop shows one Space at
/// a time. The dots open its menu.
function SpaceModules({
  space,
  pathname,
  go,
  push,
}: {
  space: Space;
  pathname: string;
  go: (href: Href) => void;
  push: (href: Href) => void;
}) {
  const theme = useTheme();
  const menu = useMenu();
  const { data: modules = [] } = useSpaceModules(space.id);
  const muted = theme.colors.mutedForeground;
  return (
    <View>
      <View className="mt-4 mb-1 flex-row items-center gap-2 pl-3">
        <SpaceIcon space={space} size={16} />
        <Text
          accessibilityRole="header"
          variant="label"
          numberOfLines={1}
          className="flex-1"
          style={{ color: muted }}
        >
          {space.name}
        </Text>
        <IconButton
          label={`${space.name} Menu`}
          size="iconSm"
          icon={<UiIcon icon={IconDots} size={16} color={muted} />}
          onPress={() =>
            menu.show(space.name, [
              {
                label: "Add Module",
                icon: IconLayoutGridAdd,
                onPress: () => push(`/space/${space.id}`),
              },
              {
                label: "Space Settings",
                icon: IconSettings,
                onPress: () => push(`/space-settings/${space.id}`),
              },
            ])
          }
        />
      </View>
      {modules.length === 0 ? (
        <NavRow
          label="Start something"
          accessibilityLabel={`Start something in ${space.name}`}
          icon={<UiIcon icon={IconPlus} size={20} color={muted} />}
          onPress={() => go(`/space/${space.id}`)}
        />
      ) : null}
      {modules.filter(isModuleKey).map((module) => {
        const href = `/module/${space.id}/${module}`;
        return (
          <NavRow
            key={module}
            label={MODULE_LABELS[module]}
            accessibilityLabel={`${MODULE_LABELS[module]} in ${space.name}`}
            active={pathname === href}
            icon={<SideIcon look={MODULE_BADGES[module]} active={pathname === href} />}
            trailing={<ModuleMeta spaceId={space.id} module={module} />}
            onPress={() => go(href)}
          />
        );
      })}
    </View>
  );
}

/// The row of Space icons at the bottom, as the desktop's `SpaceSwitcher`: up to four, the
/// last one a button for the rest when there are more. The Space shown is lit up.
function SpaceSwitcher({
  spaces,
  active,
  onPick,
}: {
  spaces: Space[];
  active: Space | null;
  onPick: (space: Space) => void;
}) {
  const theme = useTheme();
  const menu = useMenu();
  const { visible, overflow } = spaceRow(spaces, active?.id ?? null);
  return (
    <View className="flex-row items-center">
      {visible.map((space) => {
        const selected = space.id === active?.id;
        return (
          <Pressable
            key={space.id}
            accessibilityRole="button"
            accessibilityLabel={spaceLabel(space)}
            accessibilityState={{ selected }}
            onPress={() => onPick(space)}
            style={{ width: MIN_TOUCH, height: MIN_TOUCH }}
            className="items-center justify-center"
          >
            <View
              className={cn(
                "size-9 items-center justify-center rounded-md",
                selected && "bg-sidebar-accent",
              )}
            >
              <SpaceIcon space={space} size={20} />
            </View>
          </Pressable>
        );
      })}
      {overflow.length > 0 ? (
        <IconButton
          label="More Spaces"
          icon={<UiIcon icon={IconDots} size={20} color={theme.colors.mutedForeground} />}
          onPress={() =>
            menu.show(
              "Spaces",
              overflow.map((space) => ({
                label: space.name,
                checked: space.id === active?.id,
                onPress: () => onPick(space),
              })),
            )
          }
        />
      ) : null}
    </View>
  );
}

const SPACE_SHOWN = z.string().nullable();

/// The app's navigation, as a sidebar that slides the page aside, mirroring the desktop's:
/// the mascot's card, Search and the overviews across every Space, then one Space at a time
/// with its modules, and at the bottom the Space switcher, Trash and Settings.
export function Sidebar({ close }: { close: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const menu = useMenu();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { data: spaces = [] } = useSpaces();
  const go = (href: Href) => {
    router.navigate(href);
    close();
  };
  const push = (href: Href) => {
    close();
    router.push(href);
  };
  const muted = theme.colors.mutedForeground;
  const [topPref] = usePreference("sidebar.top", topSchema, DEFAULT_TOP);
  const top = visibleTop(topPref).map((item) => ({ ...item, look: TOP_ICONS[item.id] }));
  const [shownId, setShownId] = usePreference("sidebar.space", SPACE_SHOWN, null);
  // Opening a module of another Space (from a link, a search) shows that Space here.
  const pathSpace = /^\/module\/([^/]+)\//.exec(pathname)?.[1] ?? null;
  useEffect(() => {
    if (pathSpace && pathSpace !== shownId) setShownId(pathSpace);
  }, [pathSpace, shownId, setShownId]);
  const shown = spaces.find((s) => s.id === shownId) ?? spaces[0] ?? null;
  return (
    // Inset like the desktop's (`SIDEBAR_PANEL_CLASSES`): the page's background shows
    // through. To bring the panel back: bg-sidebar here, the sidebar color in the drawer.
    <View
      className={SIDEBAR_PANEL_CLASSES}
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}
    >
      <ScrollView className="flex-1" contentContainerClassName="p-2 pt-1">
        <DayCard go={go} />
        <NavRow
          label="Search"
          role="search"
          active={pathname === "/search"}
          icon={
            <SideIcon
              look={{ symbol: "magnifyingglass", fallback: IconSearch }}
              active={pathname === "/search"}
            />
          }
          onPress={() => go("/search")}
        />
        {top.map(({ id, label, href, look }) =>
          id === "tasks" ? (
            <TasksRow
              key={href}
              icon={<SideIcon look={look} active={pathname === href} />}
              active={pathname === href}
              go={go}
            />
          ) : (
            <NavRow
              key={href}
              label={label}
              active={pathname === href}
              icon={<SideIcon look={look} active={pathname === href} />}
              // Quick Jot is something to do, so it opens over the page, not instead of it.
              onPress={() => (id === "jot" ? push(href) : go(href))}
            />
          ),
        )}
        {shown ? (
          <SpaceModules space={shown} pathname={pathname} go={go} push={push} />
        ) : (
          <Text tone="muted" className="px-3 pt-6 text-center">
            Use + to make your first Space, or sign in to sync yours.
          </Text>
        )}
      </ScrollView>
      <View className="flex-row items-center border-t border-sidebar-border px-1 pt-1">
        <IconButton
          label="New"
          icon={<UiIcon icon={IconPlus} size={20} color={muted} />}
          onPress={() =>
            menu.show(undefined, [
              { label: "New Space", icon: IconFolderPlus, onPress: () => push("/new/space") },
              ...(shown
                ? [
                    {
                      label: `Add Module to ${shown.name}`,
                      icon: IconLayoutGridAdd,
                      onPress: () => push(`/space/${shown.id}`),
                    },
                  ]
                : []),
            ])
          }
        />
        <View className="flex-1">
          <SpaceSwitcher spaces={spaces} active={shown} onPick={(s) => setShownId(s.id)} />
        </View>
        <View className="mx-1 h-4 w-px bg-sidebar-border" />
        <IconButton
          label="Trash"
          icon={<UiIcon icon={IconTrash} size={20} color={muted} />}
          onPress={() => go("/trash")}
        />
        <IconButton
          label="Settings"
          icon={<UiIcon icon={IconSettings} size={20} color={muted} />}
          onPress={() => push("/settings")}
        />
      </View>
    </View>
  );
}
