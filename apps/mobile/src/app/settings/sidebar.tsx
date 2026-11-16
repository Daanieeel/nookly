import { SidebarSettingsScreen } from "../../screens/settings/SidebarSettings.tsx";
import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function SidebarSettingsRoute() {
  return useIsTablet() ? <SettingsDialog initial="sidebar" /> : <SidebarSettingsScreen />;
}
