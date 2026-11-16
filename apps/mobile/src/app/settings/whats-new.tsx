import { WhatsNewScreen } from "../../screens/WhatsNewScreen.tsx";
import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function WhatsNewRoute() {
  return useIsTablet() ? <SettingsDialog initial="whats-new" /> : <WhatsNewScreen />;
}
