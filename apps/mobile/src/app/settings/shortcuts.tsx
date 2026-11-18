import { ShortcutsPage } from "../../screens/settings/ShortcutsPage.tsx";
import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function ShortcutsRoute() {
  return useIsTablet() ? <SettingsDialog initial="shortcuts" /> : <ShortcutsPage />;
}
