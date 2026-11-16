import { PointerPressable } from "../ui/PointerPressable.tsx";
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconLayoutColumns,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconPin,
  IconPinnedOff,
  IconPlus,
  IconX,
} from "@tabler/icons-react-native";
import { ScrollView, View } from "react-native";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CONTROL_SIZE, touchSlop } from "../ui/touch.ts";
import { SEPARATOR, useMenu } from "../ui/menu.tsx";
import { useAnchor } from "../ui/sheet/anchor.ts";
import { PathIcon, usePathTitle } from "./Crumbs.tsx";
import type { PageTab } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

function TabLabel({ tab, active, preview }: { tab: PageTab; active: boolean; preview: boolean }) {
  const theme = useTheme();
  const title = usePathTitle(tab.view, tab.id);
  const menu = useMenu();
  const anchor = useAnchor();
  const two = useWorkspace((s) => s.ws.layout.groups.length > 1);
  const inLeft = useWorkspace((s) => s.ws.layout.groups[0]?.tabs.some((t) => t.id === tab.id));
  const zoomed = useWorkspace((s) => s.ws.zoomed);
  // The desktop's tab menu, as a popover on the tab.
  const showMenu = () =>
    menu.show(
      title,
      [
        {
          label: tab.pinned ? "Unpin Tab" : "Pin Tab",
          icon: tab.pinned ? IconPinnedOff : IconPin,
          onPress: () => workspace.pin(tab.id, !tab.pinned),
        },
        SEPARATOR,
        {
          label: "Split Right",
          icon: IconLayoutColumns,
          onPress: () => split(tab.id, "right"),
        },
        { label: "Split Left", icon: IconLayoutSidebar, onPress: () => split(tab.id, "left") },
        ...(two
          ? [
              {
                label: inLeft ? "Move to Right Group" : "Move to Left Group",
                icon: inLeft ? IconArrowBarToRight : IconArrowBarToLeft,
                onPress: () => workspace.moveToOther(tab.id),
              },
              {
                label: zoomed ? "Show Both Groups" : "Zoom Group",
                icon: zoomed ? IconArrowsMinimize : IconArrowsMaximize,
                onPress: () => workspace.toggleZoom(),
              },
            ]
          : []),
        SEPARATOR,
        { label: "Close Tab", icon: IconX, onPress: () => workspace.close(tab.id) },
        {
          label: "Close Other Tabs",
          icon: IconX,
          onPress: () => workspace.closeOthers(tab.id),
        },
      ],
      { anchor },
    );
  return (
    <View
      ref={anchor.ref}
      collapsable={false}
      className={cn(
        "h-9 max-w-56 flex-row items-center rounded-md",
        tab.pinned ? "px-1" : "pl-3",
        active ? "bg-accent" : "active:bg-accent/50",
      )}
    >
      <PointerPressable
        onSecondary={showMenu}
        hoverClassName="opacity-80"
        accessibilityRole="tab"
        accessibilityLabel={tab.pinned ? `${title}, pinned` : title}
        accessibilityState={{ selected: active }}
        accessibilityActions={[{ name: "longpress", label: "Tab Menu" }]}
        onAccessibilityAction={showMenu}
        onPress={() => workspace.select(tab.id)}
        onLongPress={showMenu}
        hitSlop={{ top: touchSlop(CONTROL_SIZE.sm).top, bottom: touchSlop(CONTROL_SIZE.sm).bottom }}
        className={cn(
          "min-w-0 flex-shrink active:opacity-60",
          tab.pinned && "size-9 items-center justify-center",
        )}
      >
        {tab.pinned ? (
          <PathIcon path={tab.view} />
        ) : (
          <Text
            numberOfLines={1}
            className={cn(!active && "text-muted-foreground", preview && "italic")}
          >
            {title}
          </Text>
        )}
      </PointerPressable>
      {tab.pinned ? null : (
        <IconButton
          label={`Close ${title}`}
          size="iconSm"
          icon={<IconX size={14} color={theme.colors.mutedForeground} />}
          onPress={() => workspace.close(tab.id)}
        />
      )}
    </View>
  );
}

/// With two groups but room for one (a medium window, a zoomed group), the shown group's
/// tab strip switches to the other, as the desktop's.
function OtherGroupButton({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const groups = useWorkspace((s) => s.ws.layout.groups);
  const other = groups.find((g) => g.id !== groupId);
  if (!other) return null;
  const left = groups[0].id === other.id;
  const Icon = left ? IconLayoutSidebar : IconLayoutSidebarRight;
  return (
    <IconButton
      label={left ? "Show Left Group" : "Show Right Group"}
      size="iconSm"
      icon={<Icon size={16} color={theme.colors.mutedForeground} />}
      onPress={() => workspace.focus(other.id)}
    />
  );
}

/// A tab copied into the group on its side, as the desktop's Split Right and Left.
function split(tabId: string, side: "right" | "left") {
  workspace.select(tabId);
  if (side === "right") workspace.splitRight();
  else workspace.splitLeft();
}

/// A group's open tabs, with a button for a new one: the desktop's tab bar. `alone` when the
/// other group is hidden, to switch to it.
export function TabStrip({ groupId, alone = false }: { groupId: string; alone?: boolean }) {
  const theme = useTheme();
  const group = useWorkspace((s) => s.ws.layout.groups.find((g) => g.id === groupId));
  const preview = useWorkspace((s) => s.ws.preview[groupId]);
  if (!group) return null;
  return (
    <View className="h-11 flex-row items-center px-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerClassName="items-center gap-1"
      >
        {/* Pinned tabs first, as icons, as on the desktop. */}
        {[...group.tabs.filter((t) => t.pinned), ...group.tabs.filter((t) => !t.pinned)].map(
          (tab) => (
            <TabLabel
              key={tab.id}
              tab={tab}
              active={tab.id === group.activeTabId}
              preview={tab.id === preview}
            />
          ),
        )}
      </ScrollView>
      {alone ? <OtherGroupButton groupId={groupId} /> : null}
      <IconButton
        label="New Tab"
        size="iconSm"
        icon={<IconPlus size={16} color={theme.colors.mutedForeground} />}
        onPress={() => {
          workspace.focus(groupId);
          workspace.open("/", "newTab");
        }}
      />
    </View>
  );
}
