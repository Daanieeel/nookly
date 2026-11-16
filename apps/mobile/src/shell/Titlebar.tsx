import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconCloudX,
  IconRefresh,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSearch,
  IconSettings,
  IconColumns,
  IconLayoutColumns,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconX,
} from "@tabler/icons-react-native";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { Button } from "../ui/Button.tsx";
import { type MenuEntry, SEPARATOR, useMenu } from "../ui/menu.tsx";
import { useAnchor } from "../ui/sheet/anchor.ts";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Crumbs } from "./Crumbs.tsx";
import { useDetailsOver } from "./details-over.ts";
import { useInspectorCollapsed, useOpenBeside } from "./layout-prefs.ts";
import { useSyncState } from "../data/context.tsx";
import { syncLine } from "../screens/sync-status.ts";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import type { PaletteCommand } from "./commands.ts";
import { focusedTab } from "./workspace.ts";
import { useWorkspace } from "./workspace-store.ts";
import { SHORTCUTS, shortcutLabel } from "./shortcuts.ts";
import { useShell } from "./store.ts";
import { CONTROL_SIZE, MIN_TOUCH, touchSlop } from "../ui/touch.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

const search = SHORTCUTS.find((s) => s.id === "search");

/// How tall the titlebar is under the status bar: 52, its controls a finger tall.
export const TITLEBAR_HEIGHT = 52;

/// The desktop's titlebar at touch size (`titlebar.tsx`): fold the sidebar, go back and
/// forward in this tab, the crumbs of what it shows, the search field that opens the
/// palette, how sync is doing, the split button and the details toggle. A medium window
/// keeps the last crumb and a search button.
export function Titlebar({
  onAction,
  sidebarCollapsed,
  top,
  compact,
  leading = 0,
}: {
  onAction: (action: AppAction) => void;
  sidebarCollapsed: boolean;
  /// The status bar's height, when this is the first thing on the screen.
  top: number;
  /// A medium window: the last crumb only, and a search button.
  compact: boolean;
  /// Room for iPadOS's window controls at the top left (0.4).
  leading?: number;
}) {
  const theme = useTheme();
  const router = useRouter();
  const open = useShell((s) => s.open);
  const muted = theme.colors.mutedForeground;
  const tab = useWorkspace((s) => focusedTab(s.ws));
  const canGoBack = tab.backStack.length > 0;
  const canGoForward = tab.forwardStack.length > 0;
  const item = /^\/(entity|file)\//.test(tab.view);
  const [collapsed] = useInspectorCollapsed();
  const fits = useDetailsOver((s) => s.fits);
  const overOpen = useDetailsOver((s) => s.open);
  const inspectorCollapsed = fits ? collapsed : !overOpen;
  return (
    <View
      className="flex-row items-center gap-1 border-b border-border bg-background px-2"
      style={{ paddingTop: top, height: TITLEBAR_HEIGHT + top, paddingLeft: 8 + leading }}
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
      <View className={cn(!canGoBack && "opacity-40")}>
        <IconButton
          label="Go Back"
          icon={<IconChevronLeft size={20} color={muted} />}
          onPress={() => onAction("back")}
        />
      </View>
      <View className={cn(!canGoForward && "opacity-40")}>
        <IconButton
          label="Go Forward"
          icon={<IconChevronRight size={20} color={muted} />}
          onPress={() => onAction("forward")}
        />
      </View>
      <View className="min-w-0 flex-1 flex-row items-center">
        <Crumbs path={tab.view} short={compact} />
      </View>
      {compact ? (
        <IconButton
          label="Search"
          icon={<IconSearch size={20} color={muted} />}
          onPress={() => open("search")}
        />
      ) : (
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search"
          accessibilityHint="Opens search and commands"
          onPress={() => open("search")}
          hitSlop={touchSlop(CONTROL_SIZE.sm, MIN_TOUCH)}
          className="h-8 w-56 flex-row items-center gap-2 rounded-md border border-input bg-background px-3 active:bg-accent"
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
      )}
      <SyncButton />
      <SplitButton onAction={onAction} />
      {item ? (
        <IconButton
          label={inspectorCollapsed ? "Show Details" : "Hide Details"}
          icon={
            inspectorCollapsed ? (
              <IconLayoutSidebarRightExpand size={20} color={muted} />
            ) : (
              <IconLayoutSidebarRightCollapse size={20} color={muted} />
            )
          }
          onPress={() => onAction("toggleInspector")}
        />
      ) : null}
      <IconButton
        label="Settings"
        icon={<IconSettings size={20} color={muted} />}
        onPress={() => router.push("/settings")}
      />
    </View>
  );
}

/// The sync state's icon, the desktop's state for state (`SyncStatusButton`); a tap opens
/// a popover with the state in words and what to do about it.
function SyncButton() {
  const theme = useTheme();
  const router = useRouter();
  const { sync } = useAppData();
  const status = useSyncState((s) => s.status);
  const signedIn = useSyncState((s) => s.user !== null);
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const muted = theme.colors.mutedForeground;
  const SyncIcon = !signedIn
    ? IconCloud
    : status.conflicts > 0
      ? IconAlertTriangle
      : status.state === "syncing"
        ? IconRefresh
        : status.state === "offline"
          ? IconCloudOff
          : status.state === "error"
            ? IconCloudX
            : status.live
              ? IconCloudCheck
              : IconCloud;
  const line = syncLine(signedIn, status);
  const go = (path: Href) => {
    setOpen(false);
    router.push(path);
  };
  return (
    <>
      <View ref={anchor.ref} collapsable={false}>
        <IconButton
          label={`Sync status. ${line}`}
          icon={
            <SyncIcon size={20} color={status.conflicts > 0 ? theme.colors.destructive : muted} />
          }
          onPress={() => setOpen(true)}
        />
      </View>
      <Sheet open={open} onOpenChange={setOpen} title="Sync" kind="picker" anchor={anchor}>
        <View className="gap-3 p-3">
          <Text>{line}</Text>
          {signedIn ? (
            <Button
              label="Sync Now"
              variant="secondary"
              onPress={() => {
                setOpen(false);
                void sync.syncNow();
              }}
            />
          ) : (
            <Button label="Sign In" onPress={() => go("/account/sign-in")} />
          )}
          {status.conflicts > 0 ? (
            <Button label="Review Changes" variant="secondary" onPress={() => go("/conflicts")} />
          ) : null}
          {signedIn ? (
            <Button label="Account" variant="ghost" onPress={() => go("/settings/account")} />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

/// The desktop's split button: a popover with Split Right and Split Left, or Close Split
/// while two groups are open.
function SplitButton({ onAction }: { onAction: (action: AppAction) => void }) {
  const theme = useTheme();
  const menu = useMenu();
  const anchor = useAnchor();
  const two = useWorkspace((s) => s.ws.layout.groups.length > 1);
  const [beside, setBeside] = useOpenBeside();
  const entries: MenuEntry[] = [
    ...(two
      ? [{ label: "Close Split", icon: IconX, onPress: () => onAction("closeSplit") }]
      : [
          {
            label: "Split Right",
            icon: IconLayoutSidebarRight,
            onPress: () => onAction("splitRight"),
          },
          { label: "Split Left", icon: IconLayoutSidebar, onPress: () => onAction("splitLeft") },
        ]),
    SEPARATOR,
    {
      label: "Open Items Beside the List",
      icon: IconColumns,
      checked: beside,
      onPress: () => setBeside(!beside),
    },
  ];
  return (
    <View ref={anchor.ref} collapsable={false}>
      <IconButton
        label="Split"
        icon={<IconLayoutColumns size={20} color={theme.colors.mutedForeground} />}
        onPress={() => menu.show("Split", entries, { anchor })}
      />
    </View>
  );
}
