import { useRouter } from "expo-router";
import { useAppData } from "../data/context.tsx";
import type { PaletteCommand } from "./commands.ts";
import { history } from "./history.ts";
import { useInspectorCollapsed, useSidebarCollapsed } from "./layout-prefs.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// What the window does for the palette and the keyboard shortcuts.
export function useShellActions(): (action: AppAction) => void {
  const router = useRouter();
  const { sync } = useAppData();
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const [inspectorCollapsed, setInspectorCollapsed] = useInspectorCollapsed();
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
      case "forward": {
        const path = history.forward();
        if (path) router.navigate(path);
        break;
      }
    }
  };
}
