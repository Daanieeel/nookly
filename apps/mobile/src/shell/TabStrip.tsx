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
import { type MutableRefObject, useRef } from "react";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { LIFT_DELAY, LIFT_SCALE, SPRING } from "../ui/motion.ts";
import { useReduceMotion } from "../ui/reduce-motion.ts";
import { useWindowSize } from "../ui/pane.tsx";
import { SPLIT_EDGE, type TabSlot, tabDrop, useTabDrag } from "./tab-drag.ts";
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

/// Screen reader moves for a tab, which cannot be dragged.
const TAB_ACTIONS = [
  { name: "longpress", label: "Tab Menu" },
  { name: "moveLeft", label: "Move Left" },
  { name: "moveRight", label: "Move Right" },
];

function TabLabel({
  tab,
  index,
  count,
  slots,
  active,
  preview,
}: {
  tab: PageTab;
  index: number;
  count: number;
  slots: MutableRefObject<(TabSlot | undefined)[]>;
  active: boolean;
  preview: boolean;
}) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const { width: windowWidth } = useWindowSize();
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
  // Held, a tab lifts and follows the finger (D86): along the strip to a new place, or to
  // the window's right edge for a group of its own. Let go where it was, its menu opens.
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lifted = useSharedValue(false);
  const overEdge = useSharedValue(false);
  const land = (dx: number, dy: number, x: number) => {
    dragged(false, false);
    const drop = tabDrop({ slots: slots.current, count, from: index, dx, dy, x, windowWidth });
    if (drop.kind === "menu") showMenu();
    else if (drop.kind === "right") workspace.move(tab.id, "new-right");
    else if (drop.kind === "reorder") workspace.reorder(tab.id, drop.to);
  };
  const dragged = (dragging: boolean, over: boolean) =>
    useTabDrag.setState({ dragging, overEdge: over });
  const pan = Gesture.Pan()
    .activateAfterLongPress(LIFT_DELAY)
    .withTestId(`tab-drag-${tab.id}`)
    .onStart(() => {
      "worklet";
      lifted.value = true;
      runOnJS(dragged)(true, false);
    })
    .onUpdate((event) => {
      "worklet";
      tx.value = event.translationX;
      ty.value = event.translationY;
      const over = event.absoluteX >= windowWidth - SPLIT_EDGE;
      if (over !== overEdge.value) {
        overEdge.value = over;
        runOnJS(dragged)(true, over);
      }
    })
    .onEnd((event) => {
      "worklet";
      runOnJS(land)(event.translationX, event.translationY, event.absoluteX);
    })
    .onFinalize(() => {
      "worklet";
      lifted.value = false;
      overEdge.value = false;
      tx.value = withSpring(0, SPRING.lift);
      ty.value = withSpring(0, SPRING.lift);
    });
  const style = useAnimatedStyle(() => ({
    zIndex: lifted.value ? 10 : 0,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: withSpring(lifted.value && !reduce ? LIFT_SCALE : 1, SPRING.lift) },
    ],
  }));
  const moveBy = (step: number) => {
    const to = index + step;
    if (to >= 0 && to < count) workspace.reorder(tab.id, to);
  };
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={style}
        onLayout={(e) => {
          slots.current[index] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
        }}
      >
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
            accessibilityActions={TAB_ACTIONS}
            onAccessibilityAction={(event) => {
              const action = event.nativeEvent.actionName;
              if (action === "moveLeft") moveBy(-1);
              else if (action === "moveRight") moveBy(1);
              else showMenu();
            }}
            onPress={() => workspace.select(tab.id)}
            onLongPress={showMenu}
            hitSlop={{
              top: touchSlop(CONTROL_SIZE.sm).top,
              bottom: touchSlop(CONTROL_SIZE.sm).bottom,
            }}
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
      </Animated.View>
    </GestureDetector>
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
  const slots = useRef<(TabSlot | undefined)[]>([]);
  if (!group) return null;
  // Pinned tabs first, as icons, as on the desktop.
  const tabs = [...group.tabs.filter((t) => t.pinned), ...group.tabs.filter((t) => !t.pinned)];
  return (
    <View className="h-11 flex-row items-center px-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerClassName="items-center gap-1"
      >
        {tabs.map((tab, index) => (
          <TabLabel
            key={tab.id}
            tab={tab}
            index={index}
            count={tabs.length}
            slots={slots}
            active={tab.id === group.activeTabId}
            preview={tab.id === preview}
          />
        ))}
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
