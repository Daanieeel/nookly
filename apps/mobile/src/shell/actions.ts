import { useAppData } from "../data/context.tsx";
import type { PaletteCommand } from "./commands.ts";
import { useInspectorCollapsed, useSidebarCollapsed } from "./layout-prefs.ts";
import { focusedTab } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// What the window does for the palette, the titlebar and the keyboard shortcuts.
export function useShellActions(toggleSidebar?: () => void): (action: AppAction) => void {
  const { sync } = useAppData();
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [inspectorCollapsed, setInspectorCollapsed] = useInspectorCollapsed();
  return (action) => {
    switch (action) {
      case "sync":
        void sync.syncNow();
        break;
      case "toggleSidebar":
        if (toggleSidebar) toggleSidebar();
        else setSidebarCollapsed(!sidebarCollapsed);
        break;
      case "toggleInspector":
        setInspectorCollapsed(!inspectorCollapsed);
        break;
      case "back":
        workspace.back();
        break;
      case "forward":
        workspace.forward();
        break;
      case "newTab":
        workspace.open("/", "newTab");
        break;
      case "closeTab":
        workspace.close(focusedTab(useWorkspace.getState().ws).id);
        break;
      case "splitRight":
        workspace.splitRight();
        break;
      case "nextTab":
        workspace.cycle(1);
        break;
      case "previousTab":
        workspace.cycle(-1);
        break;
      case "closeSplit": {
        // Closes the other group, as the desktop's split button does with two open.
        const { layout } = useWorkspace.getState().ws;
        const other = layout.groups.find((g) => g.id !== layout.focusedGroupId);
        for (const tab of other?.tabs ?? []) workspace.close(tab.id);
        break;
      }
    }
  };
}
