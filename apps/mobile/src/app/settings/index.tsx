import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { SettingsScreen } from "../../screens/SettingsScreen.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function SettingsRoute() {
  return useIsTablet() ? <SettingsDialog initial="general" /> : <SettingsScreen />;
}
