import { useMemo, useRef } from "react";
import { View } from "react-native";
import { cn } from "../ui/classes.ts";
import { GroupWidthProvider, INSPECTOR_MIN_PANE, InspectorShownProvider } from "../ui/pane.tsx";
import { Text } from "../ui/Text.tsx";
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

/// One tab's page. Hidden tabs stay drawn, out of sight.
function TabPage({
  tab,
  shown,
  groupId,
  focused,
}: {
  tab: PageTab;
  shown: boolean;
  groupId: string;
  focused: boolean;
}) {
  const page = useMemo(() => matchPage(tab.view), [tab.view]);
  const host = useMemo(
    () => ({ tabId: tab.id, groupId, path: tab.view, active: shown, focused }),
    [tab.id, groupId, tab.view, shown, focused],
  );
  return (
    <View className="flex-1" style={shown ? undefined : { display: "none" }}>
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
}: {
  group: Group;
  focused: boolean;
  /// The group's width, for the page's own layout.
  width: number;
  /// Whether this group draws its own tab row (both groups showing).
  tabs: boolean;
  /// The desktop's page card (rounded, outlined): off with the sidebar folded away.
  card: boolean;
}) {
  const [inspectorCollapsed] = useInspectorCollapsed();
  const active = group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0];
  const recent = useRef<string[]>([]);
  recent.current = [active.id, ...recent.current.filter((id) => id !== active.id)]
    .filter((id) => group.tabs.some((t) => t.id === id))
    .slice(0, KEPT_TABS);
  const kept = group.tabs.filter((t) => recent.current.includes(t.id));
  const openId = /^\/entity\/([^/?]+)/.exec(active.view)?.[1];
  const inspectorShown = Boolean(openId) && !inspectorCollapsed && width >= INSPECTOR_MIN_PANE;
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
                />
              ))}
            </View>
          </InspectorShownProvider>
        </GroupWidthProvider>
        {inspectorShown && openId ? <Inspector id={openId} /> : null}
      </View>
    </View>
  );
}
