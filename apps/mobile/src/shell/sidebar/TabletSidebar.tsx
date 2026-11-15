import { type Space } from "@nookly/shared/data";
import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFolderPlus,
  IconLayoutGridAdd,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconSettings,
  IconTag,
  IconTrash,
} from "@tabler/icons-react-native";
import { type Href, useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSpaceModules, useSpaces, useViews } from "../../data/queries.ts";
import { usePreference } from "../../data/preferences.ts";
import { DEFAULT_TOP, topSchema, visibleTop } from "../../screens/sidebar-top.ts";
import {
  DayCard,
  ModuleMeta,
  SPACE_SHOWN,
  SpaceSwitcher,
  TOP_ICONS,
  useSidebarIconColor,
} from "../../screens/Sidebar.tsx";
import { SpaceIcon } from "../../screens/SpaceIcon.tsx";
import { IconButton } from "../../ui/Button.tsx";
import { cn } from "../../ui/classes.ts";
import { Glyph } from "../../ui/kit/Glyph.tsx";
import { MODULE_BADGES } from "../../ui/kit/badges.ts";
import { useMenu } from "../../ui/menu.tsx";
import { FADE, SPRING, rubberBand } from "../../ui/motion.ts";
import { useReduceMotion } from "../../ui/reduce-motion.ts";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { FACE } from "../../ui/tokens.ts";
import { activePath } from "../workspace.ts";
import { useWorkspace, workspace } from "../workspace-store.ts";

/// The tablet's rows: a finger's height, the desktop's type one step up for touch.
const ROW_HEIGHT = 44;
const ICON = 18;

/// The page the focused tab shows: what the sidebar lights up.
function useShownPath(): string {
  return useWorkspace((s) => activePath(s.ws));
}

/// One row of the sidebar, as the desktop's `SidebarMenuButton` at a finger's size.
function Row({
  label,
  icon,
  active = false,
  onPress,
  onLongPress,
  trailing,
  indent = false,
  accessibilityLabel,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
  indent?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ height: ROW_HEIGHT }}
      className={cn(
        "flex-row items-center gap-2.5 rounded-md pr-1",
        indent ? "pl-9" : "pl-2.5",
        active ? "bg-sidebar-accent" : "active:bg-sidebar-accent/60",
      )}
    >
      <View style={{ width: 22, alignItems: "center" }} pointerEvents="none">
        {icon}
      </View>
      <Text
        numberOfLines={1}
        className="flex-1"
        style={{
          fontSize: 15,
          lineHeight: 20,
          fontFamily: FACE[active ? "600" : "500"],
          color: active ? theme.colors.foreground : theme.colors.foreground,
        }}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

/// The saved Views of a module (or of the Tasks overview), unfolded under its row.
function ViewRows({ module, spaceId, base }: { module: string; spaceId?: string; base: string }) {
  const theme = useTheme();
  const path = useShownPath();
  const { data: views = [] } = useViews(spaceId ? { spaceId, module } : { module });
  return (
    <>
      {views.map((view) => {
        const href = `${base}?view=${view.entity.id}`;
        return (
          <Row
            key={view.entity.id}
            indent
            label={view.entity.title || "Untitled"}
            accessibilityLabel={`${view.entity.title || "Untitled"}, saved View`}
            active={path === href}
            icon={
              <Glyph
                icon={MODULE_BADGES.tasks.glyph}
                size={16}
                color={theme.colors.mutedForeground}
              />
            }
            onPress={() => workspace.open(href)}
          />
        );
      })}
    </>
  );
}

/// A chevron that unfolds a row's saved Views, shown only when it has some.
function Unfold({ open, onToggle, name }: { open: boolean; onToggle: () => void; name: string }) {
  const theme = useTheme();
  const Chevron = open ? IconChevronDown : IconChevronRight;
  return (
    <IconButton
      label={open ? `Collapse ${name}` : `Expand ${name}`}
      size="iconSm"
      icon={<Chevron size={16} color={theme.colors.mutedForeground} />}
      onPress={onToggle}
    />
  );
}

function hasViews(module: string) {
  return module === "tasks" || module === "files";
}

/// A module of the Space, its figure, and its saved Views unfolding under it.
function ModuleRow({ space, module }: { space: Space; module: string }) {
  const color = useSidebarIconColor();
  const menu = useMenu();
  const router = useRouter();
  const path = useShownPath();
  const href = `/module/${space.id}/${module}`;
  const { data: views = [] } = useViews({ spaceId: space.id, module });
  const inside = path.startsWith(`${href}?view=`);
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    // Opening one of its Views from anywhere unfolds it, as on the desktop.
    if (inside) setOpen(true);
  }, [inside]);
  if (!isModuleKey(module)) return null;
  const label = MODULE_LABELS[module];
  return (
    <View>
      <Row
        label={label}
        accessibilityLabel={`${label} in ${space.name}`}
        active={path === href}
        icon={<Glyph icon={MODULE_BADGES[module].glyph} size={ICON} color={color} />}
        trailing={
          <View className="flex-row items-center">
            <ModuleMeta spaceId={space.id} module={module} />
            {hasViews(module) && views.length > 0 ? (
              <Unfold open={open} onToggle={() => setOpen((o) => !o)} name={label} />
            ) : null}
          </View>
        }
        onPress={() => workspace.open(href)}
        onLongPress={() =>
          menu.show(label, [
            {
              label: "Open in New Tab",
              icon: IconPlus,
              onPress: () => workspace.open(href, "newTab"),
            },
            {
              label: "Open on the Right",
              icon: IconLayoutGridAdd,
              onPress: () => workspace.open(href, "right"),
            },
            {
              label: "Remove Module",
              icon: IconTrash,
              destructive: true,
              onPress: () => router.push(`/space-settings/${space.id}`),
            },
          ])
        }
      />
      {open && hasViews(module) ? (
        <ViewRows module={module} spaceId={space.id} base={href} />
      ) : null}
    </View>
  );
}

/// The Space's name over its modules, with its menu.
function SpaceHeader({ space }: { space: Space }) {
  const theme = useTheme();
  const menu = useMenu();
  const router = useRouter();
  const muted = theme.colors.mutedForeground;
  return (
    <View className="flex-row items-center gap-2 pl-2.5" style={{ height: ROW_HEIGHT }}>
      <SpaceIcon space={space} size={16} />
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="flex-1"
        style={{ fontSize: 13, lineHeight: 18, fontFamily: FACE["500"], color: muted }}
      >
        {space.name}
      </Text>
      <IconButton
        label={`${space.name} Menu`}
        size="iconSm"
        icon={<IconDots size={18} color={muted} />}
        onPress={() =>
          menu.show(space.name, [
            {
              label: "Add Module",
              icon: IconLayoutGridAdd,
              onPress: () => workspace.open(`/space/${space.id}`),
            },
            {
              label: "Labels",
              icon: IconTag,
              onPress: () => router.push(`/space-settings/${space.id}`),
            },
            {
              label: "Space Settings",
              icon: IconSettings,
              onPress: () => router.push(`/space-settings/${space.id}`),
            },
          ])
        }
      />
    </View>
  );
}

function SpaceModules({ space }: { space: Space }) {
  const color = useSidebarIconColor();
  const { data: modules = [] } = useSpaceModules(space.id);
  return (
    <View>
      <SpaceHeader space={space} />
      {modules.length === 0 ? (
        <Row
          label="Start something"
          accessibilityLabel={`Start something in ${space.name}`}
          icon={<IconPlus size={ICON} color={color} />}
          onPress={() => workspace.open(`/space/${space.id}`)}
        />
      ) : null}
      {modules.map((module) => (
        <ModuleRow key={module} space={space} module={module} />
      ))}
    </View>
  );
}

/// How far a sideways pan has to carry the Space, or how fast, to move on to the next.
const PAN_DISTANCE = 0.3;
const PAN_VELOCITY = 600;

/// The Space shown, and a sideways pan over it that follows the finger to the Space beside
/// it, as the desktop's two finger swipe; the new one slides in from its side.
function SpacePager({
  spaces,
  shown,
  onShow,
  width,
}: {
  spaces: Space[];
  shown: Space;
  onShow: (space: Space) => void;
  width: number;
}) {
  const reduce = useReduceMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  const index = spaces.findIndex((s) => s.id === shown.id);
  const previous = useRef(index);
  // The Space changed (a pan, a tap in the bottom row): slide it in from its side.
  useEffect(() => {
    const from = previous.current;
    previous.current = index;
    if (from === index || from === -1) return;
    if (reduce) {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: FADE.in });
      return;
    }
    offset.value = (index > from ? 1 : -1) * width;
    offset.value = withSpring(0, SPRING.sheet);
  }, [index, width, reduce, offset, opacity]);
  const step = (direction: 1 | -1) => {
    const next = spaces[index + direction];
    if (next) onShow(next);
  };
  const canPrevious = index > 0;
  const canNext = index < spaces.length - 1;
  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const x = event.translationX;
      const blocked = (x > 0 && !canPrevious) || (x < 0 && !canNext);
      offset.value = blocked ? rubberBand(x, width) : x;
    })
    .onEnd((event) => {
      const x = event.translationX;
      const far = Math.abs(x) > width * PAN_DISTANCE || Math.abs(event.velocityX) > PAN_VELOCITY;
      const direction = x < 0 ? 1 : -1;
      const allowed = direction === 1 ? canNext : canPrevious;
      if (far && allowed && Math.sign(event.velocityX || x) === -direction) {
        offset.value = withSpring(
          -direction * width,
          { ...SPRING.sheet, velocity: event.velocityX },
          () => {
            runOnJS(step)(direction);
          },
        );
      } else {
        offset.value = withSpring(0, { ...SPRING.sheet, velocity: event.velocityX });
      }
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: opacity.value,
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>
        <SpaceModules space={shown} />
      </Animated.View>
    </GestureDetector>
  );
}

/// The tablet's sidebar, the desktop's (D83): the mascot's card, the pages across every
/// Space, one Space at a time with its modules, and at the bottom the Spaces and Trash
/// (folding it away is the titlebar's, Settings the titlebar's gear). Not the phone's drawer stretched wide.
export function TabletSidebar({
  onPicked,
  pinned,
  onPin,
  width,
}: {
  /// After a pick, so a sidebar laid over the page can go.
  onPicked?: () => void;
  /// Over the page in a medium window: whether it stays beside the page instead (a window
  /// 900 wide or more), and how to change that.
  pinned?: boolean;
  onPin?: () => void;
  width: number;
}) {
  const theme = useTheme();
  const menu = useMenu();
  const router = useRouter();
  const color = useSidebarIconColor();
  const muted = theme.colors.mutedForeground;
  const path = useShownPath();
  const { data: spaces = [] } = useSpaces();
  const [topPref] = usePreference("sidebar.top", topSchema, DEFAULT_TOP);
  const top = visibleTop(topPref);
  const [shownId, setShownId] = usePreference("sidebar.space", SPACE_SHOWN, null);
  // Opening a module of another Space shows that Space here, only when the page changes.
  const pathSpace = /^\/module\/([^/]+)\//.exec(path)?.[1] ?? null;
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (pathSpace === followed.current) return;
    followed.current = pathSpace;
    if (pathSpace && pathSpace !== shownId) setShownId(pathSpace);
  }, [pathSpace, shownId, setShownId]);
  const shown = spaces.find((s) => s.id === shownId) ?? spaces[0] ?? null;
  const [tasksOpen, setTasksOpen] = useState(false);
  const { data: taskViews = [] } = useViews({ module: "tasks-overview" });
  const open = (href: string) => {
    workspace.open(href);
    onPicked?.();
  };
  const go = (href: Href) => open(String(href));
  return (
    <View className="flex-1" accessibilityLabel="Sidebar">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-2 pt-1 pb-2"
        showsVerticalScrollIndicator={false}
        onTouchEnd={undefined}
      >
        <DayCard go={go} />
        <View className="mb-1 flex-row justify-end">
          {onPin ? (
            <IconButton
              label={pinned ? "Unpin Sidebar" : "Keep Sidebar Beside the Page"}
              size="iconSm"
              icon={
                pinned ? (
                  <IconPinFilled size={16} color={muted} />
                ) : (
                  <IconPin size={16} color={muted} />
                )
              }
              onPress={onPin}
            />
          ) : null}
          <IconButton
            label="Customize Sidebar"
            size="iconSm"
            icon={<IconAdjustmentsHorizontal size={16} color={muted} />}
            onPress={() => router.push("/settings/sidebar")}
          />
        </View>
        {top.map(({ id, label, href }) => {
          const look = TOP_ICONS[id];
          const active = path === href;
          const icon = <Glyph icon={look.glyph} size={ICON} color={color} />;
          if (id === "jot") {
            return (
              <Row
                key={id}
                label={label}
                icon={icon}
                onPress={() => {
                  router.push("/new/jot");
                  onPicked?.();
                }}
              />
            );
          }
          return (
            <View key={id}>
              <Row
                label={label}
                icon={icon}
                active={active}
                onPress={() => open(href)}
                trailing={
                  id === "tasks" && taskViews.length > 0 ? (
                    <Unfold
                      open={tasksOpen}
                      onToggle={() => setTasksOpen((o) => !o)}
                      name="Tasks"
                    />
                  ) : null
                }
              />
              {id === "tasks" && tasksOpen ? (
                <ViewRows module="tasks-overview" base="/tasks" />
              ) : null}
            </View>
          );
        })}
        <View className="h-3" />
        {shown ? (
          <SpacePager
            spaces={spaces}
            shown={shown}
            onShow={(space) => setShownId(space.id)}
            width={width}
          />
        ) : (
          <Text tone="muted" className="px-3 pt-6 text-center">
            Use + to make your first Space, or sign in to sync yours.
          </Text>
        )}
      </ScrollView>
      <View className="flex-row items-center border-t border-sidebar-border px-1 pt-1 pb-1">
        <IconButton
          label="Add"
          icon={<IconPlus size={ICON} color={muted} />}
          onPress={() =>
            menu.show("Add", [
              {
                label: "New Space",
                icon: IconFolderPlus,
                onPress: () => router.push("/new/space"),
              },
              ...(shown
                ? [
                    {
                      label: `Add Module to ${shown.name}`,
                      icon: IconLayoutGridAdd,
                      onPress: () => open(`/space/${shown.id}`),
                    },
                  ]
                : []),
            ])
          }
        />
        <View className="min-w-0 flex-1">
          <SpaceSwitcher spaces={spaces} active={shown} onPick={(s) => setShownId(s.id)} />
        </View>
        <View className="mx-1 h-4 w-px bg-sidebar-border" />
        <IconButton
          label="Trash"
          icon={
            <IconTrash size={ICON} color={path === "/trash" ? theme.colors.foreground : muted} />
          }
          onPress={() => open("/trash")}
        />
      </View>
    </View>
  );
}
