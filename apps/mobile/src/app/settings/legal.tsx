import { LegalPage } from "../../screens/settings/LegalPage.tsx";
import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function LegalRoute() {
  return useIsTablet() ? <SettingsDialog initial="legal" /> : <LegalPage />;
}
