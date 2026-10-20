import { useRouter } from "expo-router";
import { useAppData } from "../data/context.tsx";
import type { PaletteCommand } from "./commands.ts";
import { history } from "./history.ts";
import { useInspectorCollapsed, useSidebarCollapsed } from "./layout-prefs.ts";
import { useTabs } from "./tabs-store.ts";
import { useTabCommands } from "./useTabCommands.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// What the window does for the palette and the keyboard shortcuts.
export function useShellActions(): (action: AppAction) => void {
  const router = useRouter();
  const { sync } = useAppData();
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [inspectorCollapsed, setInspectorCollapsed] = useInspectorCollapsed();
  const tabs = useTabCommands();
  return (action) => {
    switch (action) {
      case "sync":
        void sync.syncNow();
        break;
      case "toggleSidebar":
        setSidebarCollapsed(!sidebarCollapsed);
        break;
      case "toggleInspector":
        setInspectorCollapsed(!inspectorCollapsed);
        break;
      case "back": {
        const path = history.back();
        if (path) router.navigate(path);
        break;
      }
      case "newTab":
        tabs.open();
        break;
      case "closeTab":
        tabs.close(useTabs.getState().state.active);
        break;
      case "splitRight": {
        // The page that is open, as an item, shown a second time beside itself.
        const { tabs: all, active } = useTabs.getState().state;
        const path = all.find((t) => t.id === active)?.path ?? "/";
        if (path.startsWith("/entity/")) tabs.split(path);
        break;
      }
      case "nextTab":
        tabs.step(1);
        break;
      case "previousTab":
        tabs.step(-1);
        break;
      case "closeSplit":
        tabs.split(null);
        break;
      case "forward": {
        const path = history.forward();
        if (path) router.navigate(path);
        break;
      }
    }
  };
}
