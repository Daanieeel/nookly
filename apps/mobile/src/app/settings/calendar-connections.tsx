import { Screen } from "../../ui/Screen.tsx";
import { CalendarConnectionsPage } from "../../screens/settings/CalendarConnectionsPage.tsx";
import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function CalendarConnectionsRoute() {
  if (useIsTablet()) return <SettingsDialog initial="connections" />;
  return (
    <Screen grouped>
      <CalendarConnectionsPage />
    </Screen>
  );
}
