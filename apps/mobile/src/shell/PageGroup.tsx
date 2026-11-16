import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { cn } from "../ui/classes.ts";
import {
  GroupWidthProvider,
  INSPECTOR_MIN_PANE,
  INSPECTOR_WIDTH,
  InspectorShownProvider,
} from "../ui/pane.tsx";
import { useDetailsOver } from "./details-over.ts";
import { SidebarOverlay } from "./sidebar/SidebarOverlay.tsx";
import { Text } from "../ui/Text.tsx";
import { EdgeBack } from "./EdgeBack.tsx";
import { Inspector } from "./inspector.tsx";
import { useInspectorCollapsed } from "./layout-prefs.ts";
import { PageHost } from "./PageHost.tsx";
import { matchPage } from "./pages.tsx";
import { TabStrip } from "./TabStrip.tsx";
import type { PageGroup as Group, PageTab } from "./workspace.ts";
import { workspace } from "./workspace-store.ts";

/// How many tabs of a group stay drawn while hidden, so going back to one finds it as it
/// was (scrolled, half typed): the ones shown most recently.
const KEPT_TABS = 4;

/// One tab's page. Hidden tabs stay drawn, out of sight. A swipe from its left edge goes
/// back in the tab's history (1.10).
function TabPage({
  tab,
  shown,
  groupId,
  focused,
  width,
  onEdge,
}: {
  tab: PageTab;
  shown: boolean;
  groupId: string;
  focused: boolean;
  width: number;
  onEdge?: () => void;
}) {
  const page = useMemo(() => matchPage(tab.view), [tab.view]);
  const host = useMemo(
    () => ({ tabId: tab.id, groupId, path: tab.view, active: shown, focused }),
    [tab.id, groupId, tab.view, shown, focused],
  );
  const previous = tab.backStack.at(-1);
  const before = useMemo(() => (previous ? matchPage(previous) : undefined), [previous]);
  const beforeHost = useMemo(
    () => ({ tabId: tab.id, groupId, path: previous ?? "", active: false, focused: false }),
    [tab.id, groupId, previous],
  );
  return (
    <View className="flex-1" style={shown ? undefined : { display: "none" }}>
      <EdgeBack
        width={width}
        canGoBack={previous !== undefined}
        onBack={() => {
          workspace.focus(groupId);
          workspace.back();
        }}
        onEdge={onEdge}
        behind={
          before ? (
            <PageHost
              key={`${tab.backStack.length - 1} ${previous}`}
              page={before}
              host={beforeHost}
            />
          ) : null
        }
      >
        {page ? (
          <PageHost
            // A step to another page is a page of its own; Back shows the earlier one again.
            key={`${tab.backStack.length} ${tab.view}`}
            page={page}
            host={host}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text tone="muted">This page can't be shown in a tab.</Text>
          </View>
        )}
      </EdgeBack>
    </View>
  );
}

/// A group of the split view: its tabs (when both groups show, each has its own row), and
/// its page on the desktop's card, with the details beside an item when the group keeps
/// room for both.
export function PageGroupView({
  group,
  focused,
  width,
  tabs,
  card,
  onEdge,
}: {
  group: Group;
  focused: boolean;
  /// The group's width, for the page's own layout.
  width: number;
  /// Whether this group draws its own tab row (both groups showing).
  tabs: boolean;
  /// The desktop's page card (rounded, outlined): off with the sidebar folded away.
  card: boolean;
  /// A swipe from the page's left edge with nothing to go back to (a medium window's
  /// sidebar comes in).
  onEdge?: () => void;
}) {
  const [inspectorCollapsed] = useInspectorCollapsed();
  const active = group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0];
  const recent = useRef<string[]>([]);
  recent.current = [active.id, ...recent.current.filter((id) => id !== active.id)]
    .filter((id) => group.tabs.some((t) => t.id === id))
    .slice(0, KEPT_TABS);
  const kept = group.tabs.filter((t) => recent.current.includes(t.id));
  const openId = /^\/entity\/([^/?]+)/.exec(active.view)?.[1];
  const fits = width >= INSPECTOR_MIN_PANE;
  const inspectorShown = Boolean(openId) && !inspectorCollapsed && fits;
  // Too narrow for the details beside the page: they slide over it from the right.
  const over = useDetailsOver((s) => s.open) && focused && !fits && Boolean(openId);
  useEffect(() => {
    if (focused) useDetailsOver.setState({ fits });
  }, [focused, fits]);
  // Another item, or none: the details over the page go.
  useEffect(() => {
    if (focused) useDetailsOver.setState({ open: false });
  }, [focused, openId]);
  return (
    <View
      className="min-w-0 flex-1"
      // Touching a group focuses it, as a click does on the desktop; the touch goes on.
      onStartShouldSetResponderCapture={() => {
        if (!focused) workspace.focus(group.id);
        return false;
      }}
    >
      {tabs ? <TabStrip groupId={group.id} /> : null}
      <View
        accessibilityLabel={focused ? "Page, focused" : "Page"}
        className={cn(
          "min-h-0 flex-1 flex-row overflow-hidden bg-card",
          card && "rounded-xl border shadow-md",
          card && (focused && tabs ? "border-primary/35" : "border-sidebar-border"),
        )}
      >
        <GroupWidthProvider value={width}>
          <InspectorShownProvider value={inspectorShown}>
            <View className="min-w-0 flex-1">
              {kept.map((tab) => (
                <TabPage
                  key={tab.id}
                  tab={tab}
                  shown={tab.id === active.id}
                  groupId={group.id}
                  focused={focused}
                  width={width}
                  onEdge={onEdge}
                />
              ))}
            </View>
          </InspectorShownProvider>
        </GroupWidthProvider>
        {inspectorShown && openId ? <Inspector id={openId} /> : null}
        {!fits && openId ? (
          <SidebarOverlay
            open={over}
            onOpenChange={(open) => useDetailsOver.setState({ open })}
            width={INSPECTOR_WIDTH}
            top={0}
            side="right"
            label="Close Details"
          >
            <Inspector id={openId} />
          </SidebarOverlay>
        ) : null}
      </View>
    </View>
  );
}
