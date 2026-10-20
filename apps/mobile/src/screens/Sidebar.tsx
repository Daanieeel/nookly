import { isSharedSpace } from "@nookly/shared/api";
import {
  INPUT_CLASSES,
  SIDEBAR_GROUP_LABEL_CLASSES,
  SIDEBAR_PANEL_CLASSES,
  sidebarMenuButtonVariants,
} from "@nookly/ui/classes";
import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import {
  IconCalendarEvent,
  IconChecklist,
  IconClipboardList,
  IconPin,
  IconChevronDown,
  IconChevronRight,
  IconFeather,
  IconLayoutDashboard,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react-native";
import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Space } from "@nookly/shared/data";
import { useSyncState } from "../data/context.tsx";
import {
  useDecks,
  useExams,
  usePinned,
  useRecents,
  useSpaceModules,
  useSpaces,
  useStatuses,
  useTasks,
  useUnrefinedJots,
  useViews,
} from "../data/queries.ts";
import { tasksFor } from "./dashboard-model.ts";
import { localDay } from "./dates.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { IconButton } from "../ui/Button.tsx";
import { EntityIcon, MODULE_ICONS } from "../ui/icons.tsx";
import { Text } from "../ui/Text.tsx";
import { cn, row, splitText, withState } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { DEFAULT_TOP, type TopId, topSchema, visibleTop } from "./sidebar-top.ts";
import { usePreference } from "../data/preferences.ts";
import { syncLine } from "./sync-status.ts";

const TOP_ICONS = {
  dashboard: IconLayoutDashboard,
  calendar: IconCalendarEvent,
  tasks: IconChecklist,
  assignments: IconClipboardList,
  pinned: IconPin,
  jot: IconFeather,
} satisfies Record<TopId, typeof IconSearch>;

/// One line of the sidebar: an icon, a name, and the current page lit up.
function NavRow({
  label,
  icon,
  active = false,
  onPress,
  trailing,
  indent = 0,
  subtitle,
  accessibilityLabel,
}: {
  label: string;
  /// When the visible name alone is ambiguous, like a module's in a Space.
  accessibilityLabel?: string;
  icon: React.ReactNode;
  active?: boolean;
  onPress: () => void;
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${label}, ${subtitle}` : label)}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(box, "h-auto min-h-10 gap-3 py-2", indent > 0 && "pl-8")}
    >
      {icon}
      <View className="flex-1">
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

function Heading({ title, action }: { title: string; action?: React.ReactNode }) {
  const theme = useTheme();
  const { box, text } = splitText(row(cn(SIDEBAR_GROUP_LABEL_CLASSES)));
  return (
    <View className={cn(box, "mt-4")}>
      <Text
        accessibilityRole="header"
        className={cn(text, "flex-1")}
        style={{ color: theme.colors.mutedForeground }}
      >
        {title}
      </Text>
      {action}
    </View>
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
              icon={<IconChecklist size={16} color={theme.colors.mutedForeground} />}
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

/// The week number of a day, ISO style (the week with its Thursday in the year).
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/// The card at the top of the sidebar, like the desktop's: today's date and week, and one
/// line about what waits, changing every few seconds; tapping it opens the matching list.
function DayCard({ go }: { go: (href: Href) => void }) {
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
      className="mx-1 mb-2 gap-0.5 rounded-lg border border-sidebar-border p-3 active:opacity-80"
    >
      <Text variant="small" tone="muted">
        {`${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · Week ${isoWeek(now)}`}
      </Text>
      <Text style={{ color: theme.colors.foreground }}>
        {line?.text ?? "Nothing waiting. Enjoy the calm."}
      </Text>
    </Pressable>
  );
}

/// A Space and, once opened, its modules, as in the desktop's sidebar.
function SpaceRows({
  space,
  pathname,
  go,
}: {
  space: Space;
  pathname: string;
  go: (href: Href) => void;
}) {
  const theme = useTheme();
  const inside = pathname.startsWith(`/module/${space.id}/`);
  const [open, setOpen] = useState(inside);
  const { data: modules = [] } = useSpaceModules(space.id);
  const shared = isSharedSpace(space.id);
  const Chevron = open ? IconChevronDown : IconChevronRight;
  return (
    <View>
      <NavRow
        label={space.name}
        subtitle={shared ? "Shared with you" : undefined}
        icon={
          <View className="w-5 items-center">
            {shared ? (
              <IconUsers size={18} color={space.color} />
            ) : (
              <SpaceDot color={space.color} />
            )}
          </View>
        }
        trailing={<Chevron size={16} color={theme.colors.mutedForeground} />}
        onPress={() => setOpen((o) => !o)}
      />
      {open && modules.length === 0 ? (
        <NavRow
          indent={1}
          label="Start something"
          accessibilityLabel={`Start something in ${space.name}`}
          icon={<IconPlus size={18} color={theme.colors.mutedForeground} />}
          onPress={() => go(`/space/${space.id}`)}
        />
      ) : null}
      {open
        ? modules.filter(isModuleKey).map((module) => {
            const Icon = MODULE_ICONS[module];
            const href = `/module/${space.id}/${module}`;
            return (
              <NavRow
                key={module}
                indent={1}
                label={MODULE_LABELS[module]}
                accessibilityLabel={`${MODULE_LABELS[module]} in ${space.name}`}
                active={pathname === href}
                icon={<Icon size={18} color={theme.colors.mutedForeground} />}
                trailing={<ModuleMeta spaceId={space.id} module={module} />}
                onPress={() => go(href)}
              />
            );
          })
        : null}
    </View>
  );
}

/// The app's navigation, as a sidebar that slides the page aside: Search, the
/// overviews across every Space, Pinned, each Space with its modules, Recents, and
/// Trash and Settings at the bottom. Mirrors the desktop's sidebar.
export function Sidebar({ close }: { close: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { data: spaces = [] } = useSpaces();
  const { data: pinnedItems = [] } = usePinned();
  const { data: recentItems = [] } = useRecents();
  const syncState = useSyncState((s) => s.status);
  const signedIn = useSyncState((s) => s.user !== null);
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
  const top = visibleTop(topPref).map((item) => ({ ...item, Icon: TOP_ICONS[item.id] }));
  const { box: searchBox, text: searchText } = splitText(row(INPUT_CLASSES));
  return (
    // Inset like the desktop's (`SIDEBAR_PANEL_CLASSES`): the page's background shows
    // through. To bring the panel back: bg-sidebar here, the sidebar color in the drawer.
    <View
      className={SIDEBAR_PANEL_CLASSES}
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}
    >
      <View className="px-3">
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search"
          accessibilityHint="Titles, keys and page text across every Space"
          onPress={() => go("/search")}
          className={cn(
            searchBox,
            "h-10 items-center gap-2",
            pathname === "/search" && "border-ring",
          )}
        >
          <IconSearch size={18} color={muted} />
          <Text className={cn(searchText, "text-muted-foreground")}>Search</Text>
        </Pressable>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="p-2 pt-3">
        <DayCard go={go} />
        {top.map(({ id, label, href, Icon }) =>
          id === "tasks" ? (
            <TasksRow
              key={href}
              icon={<Icon size={20} color={muted} />}
              active={pathname === href}
              go={go}
            />
          ) : (
            <NavRow
              key={href}
              label={label}
              active={pathname === href}
              icon={<Icon size={20} color={muted} />}
              // Quick Jot is something to do, so it opens over the page, not instead of it.
              onPress={() => (id === "jot" ? push(href) : go(href))}
            />
          ),
        )}
        {pinnedItems.length > 0 ? (
          <>
            <Heading title="Pinned" />
            {pinnedItems.map((entity) => (
              <NavRow
                key={entity.id}
                label={entity.title || "Untitled"}
                icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                onPress={() => push(`/entity/${entity.id}`)}
              />
            ))}
          </>
        ) : null}
        <Heading
          title="Spaces"
          action={
            <IconButton
              label="New Space"
              icon={<IconPlus size={18} color={muted} />}
              onPress={() => push("/new/space")}
            />
          }
        />
        {spaces.length === 0 ? (
          <Text tone="muted" className="px-2">
            No Spaces yet. Make one, or sign in to sync yours.
          </Text>
        ) : null}
        {spaces.map((space) => (
          <SpaceRows key={space.id} space={space} pathname={pathname} go={go} />
        ))}
        {recentItems.length > 0 ? (
          <>
            <Heading title="Recents" />
            {recentItems.slice(0, 5).map((entity) => (
              <NavRow
                key={entity.id}
                label={entity.title || "Untitled"}
                icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                onPress={() => push(`/entity/${entity.id}`)}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
      <View className="border-t border-sidebar-border px-2 pt-2">
        <NavRow
          label="Trash"
          active={pathname === "/trash"}
          icon={<IconTrash size={20} color={muted} />}
          onPress={() => go("/trash")}
        />
        <NavRow
          label="Settings"
          subtitle={syncLine(signedIn, syncState)}
          icon={<IconSettings size={20} color={muted} />}
          onPress={() => push("/settings")}
        />
      </View>
    </View>
  );
}
