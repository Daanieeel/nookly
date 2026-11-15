import { useLocalSearchParams } from "expo-router";
import { ExternalEventScreen } from "../screens/ExternalEventScreen.tsx";
import { sheetRoute } from "../ui/sheet/route.tsx";

function ExternalEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExternalEventScreen id={id ?? ""} />;
}

export default sheetRoute("Moodle", ExternalEvent, undefined, "picker");
