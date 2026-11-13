import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewEntryScreen } from "../../screens/NewScreens.tsx";

function NewEntry() {
  const { spaceId, date, start } = useLocalSearchParams<{
    spaceId?: string;
    date?: string;
    start?: string;
  }>();
  return <NewEntryScreen spaceId={spaceId} date={date} start={start} />;
}

export default sheetRoute("New Calendar Entry", NewEntry);
