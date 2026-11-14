import { Screen } from "../../ui/Screen.tsx";
import { CalendarConnectionsPage } from "../../screens/settings/CalendarConnectionsPage.tsx";

export default function CalendarConnectionsRoute() {
  return (
    <Screen grouped>
      <CalendarConnectionsPage />
    </Screen>
  );
}
