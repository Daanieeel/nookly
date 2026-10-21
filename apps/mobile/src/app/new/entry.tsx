import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewEntryScreen } from "../../screens/NewScreens.tsx";

function NewEntry() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewEntryScreen spaceId={spaceId} />;
}

export default sheetRoute("New Calendar Entry", NewEntry);
