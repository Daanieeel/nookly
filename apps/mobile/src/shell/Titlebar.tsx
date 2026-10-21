import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSyncState } from "../data/context.tsx";
import { syncLine } from "../screens/sync-status.ts";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import type { PaletteCommand } from "./commands.ts";
import { history } from "./history.ts";
import { SHORTCUTS, shortcutLabel } from "./shortcuts.ts";
import { useShell } from "./store.ts";
import { CONTROL_SIZE, MIN_TOUCH, touchSlop } from "../ui/touch.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

const search = SHORTCUTS.find((s) => s.id === "search");

/// The desktop's titlebar, on a wide screen: fold the sidebar, go back and forward, the
/// search box that opens the palette, and how sync is doing. `version` changes whenever
/// the page changes, so the back and forward buttons know whether there is somewhere to go.
export function Titlebar({
  onAction,
  sidebarCollapsed,
  top,
}: {
  onAction: (action: AppAction) => void;
  sidebarCollapsed: boolean;
  /// The status bar's height, when this is the first thing on the screen.
  top: number;
}) {
  const theme = useTheme();
  const router = useRouter();
  const open = useShell((s) => s.open);
  const status = useSyncState((s) => s.status);
  const signedIn = useSyncState((s) => s.user !== null);
  const muted = theme.colors.mutedForeground;
  const SyncIcon = !signedIn
    ? IconCloudOff
    : status.state === "syncing"
      ? IconCloudUpload
      : status.state === "idle"
        ? IconCloudCheck
        : status.state === "error"
          ? IconAlertTriangle
          : status.state === "offline"
            ? IconCloudOff
            : IconCloud;
  const line = syncLine(signedIn, status);
  return (
    <View
      className="flex-row items-center gap-1 border-b border-border bg-background px-2"
      style={{ paddingTop: top, height: 44 + top }}
    >
      <IconButton
        label={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        icon={
          sidebarCollapsed ? (
            <IconLayoutSidebarLeftExpand size={20} color={muted} />
          ) : (
            <IconLayoutSidebarLeftCollapse size={20} color={muted} />
          )
        }
        onPress={() => onAction("toggleSidebar")}
      />
      <View className={cn(!history.canGoBack() && "opacity-40")}>
        <IconButton
          label="Go Back"
          icon={<IconChevronLeft size={20} color={muted} />}
          onPress={() => onAction("back")}
        />
      </View>
      <View className={cn(!history.canGoForward() && "opacity-40")}>
        <IconButton
          label="Go Forward"
          icon={<IconChevronRight size={20} color={muted} />}
          onPress={() => onAction("forward")}
        />
      </View>
      <View className="flex-1 items-center">
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search"
          accessibilityHint="Opens search and commands"
          onPress={() => open("search")}
          hitSlop={touchSlop(CONTROL_SIZE.sm, MIN_TOUCH)}
          className="h-8 w-full max-w-md flex-row items-center gap-2 rounded-md border border-input bg-background px-3 active:bg-accent"
        >
          <IconSearch size={16} color={muted} />
          <Text variant="small" tone="muted" className="flex-1">
            Search
          </Text>
          {search ? (
            <Text variant="small" tone="muted">
              {shortcutLabel(search)}
            </Text>
          ) : null}
        </Pressable>
      </View>
      <IconButton
        label={`Sync status. ${line}`}
        icon={
          <SyncIcon size={20} color={status.conflicts > 0 ? theme.colors.destructive : muted} />
        }
        onPress={() => (status.conflicts > 0 ? router.push("/conflicts") : onAction("sync"))}
      />
      <IconButton
        label="Settings"
        icon={<IconSettings size={20} color={muted} />}
        onPress={() => router.push("/settings")}
      />
    </View>
  );
}
