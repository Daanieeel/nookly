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
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Space } from "@nookly/shared/data";
import { useSyncState } from "../data/context.tsx";
import { usePinned, useRecents, useSpaceModules, useSpaces } from "../data/queries.ts";
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
        <Text numberOfLines={1} className={text}>
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
  const { box, text } = splitText(row(cn(SIDEBAR_GROUP_LABEL_CLASSES)));
  return (
    <View className={cn(box, "mt-4")}>
      <Text accessibilityRole="header" className={cn(text, "flex-1")}>
        {title}
      </Text>
      {action}
    </View>
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
        {top.map(({ id, label, href, Icon }) => (
          <NavRow
            key={href}
            label={label}
            active={pathname === href}
            icon={<Icon size={20} color={muted} />}
            // Quick Jot is something to do, so it opens over the page, not instead of it.
            onPress={() => (id === "jot" ? push(href) : go(href))}
          />
        ))}
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
