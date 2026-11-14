import { isSharedSpace } from "@nookly/shared/api";
import { CARD_CLASSES, SIDEBAR_PANEL_CLASSES, sidebarMenuButtonVariants } from "@nookly/ui/classes";
import { spaceRow } from "@nookly/frontend/lib/space-row";
import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import {
  IconChecklist,
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
  IconCalendarWeek,
  IconClipboardCheck,
} from "@tabler/icons-react-native";
import { z } from "zod";
import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ReorderList } from "../ui/ReorderList.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Space, reorderSpaces } from "@nookly/shared/data";
import { useLocalWrite } from "../data/context.tsx";
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
import { type BadgeLook, MODULE_BADGES } from "../ui/kit/badges.ts";
import { TINT, TYPE, withAlpha } from "../ui/tokens.ts";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/// The sidebar's rows read at the size of iOS's own sidebars: body text, and icons to match.
const ROW_ICON = 22;
const SMALL_TEXT = { fontSize: TYPE.footnote.fontSize, lineHeight: TYPE.footnote.lineHeight };
import { Mascot } from "../ui/Mascot.tsx";
import { useMenu } from "../ui/menu.tsx";
import { usePanes } from "../shell/panes.tsx";
import { MIN_TOUCH, TOUCH_ROW } from "../ui/touch.ts";
import { Text } from "../ui/Text.tsx";
import { cn, row, splitText, withState } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { DEFAULT_TOP, type TopId, topSchema, visibleTop } from "./sidebar-top.ts";
import { usePreference } from "../data/preferences.ts";

/// The top rows' icons, the desktop's own.
const TOP_ICONS = {
  dashboard: { glyph: IconLayoutDashboard },
  calendar: { glyph: IconCalendarWeek },
  tasks: { glyph: IconChecklist },
  assignments: { glyph: IconClipboardCheck },
  pinned: { glyph: IconPin },
  jot: { glyph: IconFeather },
} satisfies Record<TopId, Pick<BadgeLook, "glyph">>;

/// The sidebar's icons: the label colour, a little faded, so they read without shouting.
function useSidebarIconColor() {
  return withAlpha(useSemanticPair("label").hex, 0.85);
}

/// Nookly's name over the sidebar, always in view, with Search beside it, on a blur that
/// fades into the list scrolling under it.
const HEADER_HEIGHT = 52;
const HEADER_FADE = 20;

function SidebarHeader({ top, onSearch }: { top: number; onSearch: () => void }) {
  const theme = useTheme();
  const page = theme.colors.background;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: top + HEADER_HEIGHT }}
    >
      <BlurView
        intensity={24}
        tint={theme.dark ? "dark" : "light"}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Svg
        pointerEvents="none"
        width="100%"
        height={top + HEADER_HEIGHT + HEADER_FADE}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
      >
        <Defs>
          <LinearGradient id="sidebar-header" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={page} stopOpacity={0.9} />
            <Stop offset="0.7" stopColor={page} stopOpacity={0.6} />
            <Stop offset="1" stopColor={page} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sidebar-header)" />
      </Svg>
      <View
        style={{
          marginTop: top,
          height: HEADER_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 16,
          paddingRight: 8,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: "InterTight_900Black",
            fontSize: 28,
            lineHeight: 34,
            letterSpacing: -0.5,
            color: theme.colors.foreground,
          }}
        >
          Nookly
        </Text>
        <IconButton
          label="Search"
          icon={<IconSearch size={ROW_ICON} color={theme.colors.foreground} />}
          onPress={onSearch}
        />
      </View>
    </View>
  );
}

/// A row's icon in the sidebar: muted, in the accent on the page shown now.
function SideIcon({ look, active = false }: { look: Pick<BadgeLook, "glyph">; active?: boolean }) {
  const scheme = useScheme();
  const color = useSidebarIconColor();
  const accent = TINT.blue[scheme];
  return (
    <View style={{ width: 28, alignItems: "center" }}>
      <Glyph icon={look.glyph} size={ROW_ICON} color={active ? accent : color} />
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
}: {
  label: string;
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${label}, ${subtitle}` : label)}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={TOUCH_ROW}
      className={cn(box, "h-auto min-h-11 gap-3 py-2", indent > 0 && "pl-9")}
    >
      {icon}
      <View className="flex-1" pointerEvents="none">
        <Text
          numberOfLines={1}
          className={text}
          style={[
            { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight },
            active ? { color: theme.colors.foreground } : undefined,
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1} style={SMALL_TEXT}>
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
              icon={<Chevron size={18} color={theme.colors.mutedForeground} />}
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
              icon={<IconChecklist size={20} color={theme.colors.mutedForeground} />}
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
    <Text variant="small" tone="muted" style={SMALL_TEXT}>
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
        <Text
          variant="small"
          tone="muted"
          numberOfLines={1}
          style={{ fontSize: 14, lineHeight: 19 }}
        >
          {`${now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · Week ${isoWeek(now)}`}
        </Text>
        <Text className="font-medium" style={{ color: theme.colors.foreground }} numberOfLines={1}>
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
        <SpaceIcon space={space} size={18} />
        <Text
          accessibilityRole="header"
          variant="label"
          numberOfLines={1}
          className="flex-1"
          style={[SMALL_TEXT, { color: muted }]}
        >
          {space.name}
        </Text>
        <IconButton
          label={`${space.name} Menu`}
          size="iconSm"
          icon={<IconDots size={16} color={muted} />}
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
          icon={<IconPlus size={ROW_ICON} color={muted} />}
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
/// last one a button for the rest when there are more. The Space shown is lit up. A rest on
/// an icon lifts it, to be dragged to another place among them.
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
  const order = useLocalWrite((db, ids: string[]) => reorderSpaces(db, ids));
  /// The icons shown in their new order, in the places they held among all the Spaces.
  const reorder = (keys: string[]) => {
    const slots = spaces.flatMap((s, i) => (keys.includes(s.id) ? [i] : []));
    const ids = spaces.map((s) => s.id);
    slots.forEach((slot, i) => (ids[slot] = keys[i]));
    order.mutate(ids);
  };
  return (
    <View className="flex-row items-center">
      <ReorderList
        horizontal
        items={visible}
        keyOf={(space) => space.id}
        labelOf={spaceLabel}
        size={MIN_TOUCH}
        onReorder={reorder}
        renderItem={(space) => {
          const selected = space.id === active?.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={spaceLabel(space)}
              accessibilityState={{ selected }}
              onPress={() => onPick(space)}
              style={{ width: MIN_TOUCH, height: MIN_TOUCH }}
              className="items-center justify-center active:opacity-60"
            >
              <View
                className={cn(
                  "size-10 items-center justify-center rounded-md",
                  selected && "bg-sidebar-accent",
                )}
              >
                <SpaceIcon space={space} size={ROW_ICON} />
              </View>
            </Pressable>
          );
        }}
      />
      {overflow.length > 0 ? (
        <IconButton
          label="More Spaces"
          icon={<IconDots size={ROW_ICON} color={theme.colors.mutedForeground} />}
          onPress={() =>
            menu.show(
              "Spaces",
              overflow.map((space) => ({
                label: space.name,
                leading: <SpaceIcon space={space} size={ROW_ICON} />,
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
  const muted = useSidebarIconColor();
  const [topPref] = usePreference("sidebar.top", topSchema, DEFAULT_TOP);
  const top = visibleTop(topPref).map((item) => ({ ...item, look: TOP_ICONS[item.id] }));
  const [shownId, setShownId] = usePreference("sidebar.space", SPACE_SHOWN, null);
  // Opening a module of another Space (from a link, a search) shows that Space here. Only
  // when the page changes: picking another Space in the switcher must not snap back.
  const pathSpace = /^\/module\/([^/]+)\//.exec(pathname)?.[1] ?? null;
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (pathSpace === followed.current) return;
    followed.current = pathSpace;
    if (pathSpace && pathSpace !== shownId) setShownId(pathSpace);
  }, [pathSpace, shownId, setShownId]);
  const shown = spaces.find((s) => s.id === shownId) ?? spaces[0] ?? null;
  return (
    // Inset like the desktop's (`SIDEBAR_PANEL_CLASSES`): the page's background shows
    // through. To bring the panel back: bg-sidebar here, the sidebar color in the drawer.
    <View className={SIDEBAR_PANEL_CLASSES} style={{ paddingBottom: insets.bottom + 4 }}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-2"
        contentContainerStyle={{ paddingTop: insets.top + HEADER_HEIGHT + 4 }}
        scrollIndicatorInsets={{ top: HEADER_HEIGHT }}
      >
        <DayCard go={go} />
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
      <SidebarHeader top={insets.top} onSearch={() => go("/search")} />
      <View className="flex-row items-center border-t border-sidebar-border px-1 pt-1">
        <IconButton
          label="New"
          icon={<IconPlus size={ROW_ICON} color={muted} />}
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
          icon={<IconTrash size={ROW_ICON} color={muted} />}
          onPress={() => go("/trash")}
        />
        <IconButton
          label="Settings"
          icon={<IconSettings size={ROW_ICON} color={muted} />}
          onPress={() => push("/settings")}
        />
      </View>
    </View>
  );
}
