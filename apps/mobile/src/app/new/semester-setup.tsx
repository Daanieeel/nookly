import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { SetupSemestersScreen } from "../../screens/SetupSemestersScreen.tsx";

function SetupSemesters() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <SetupSemestersScreen spaceId={spaceId} />;
}

export default sheetRoute("Set Up Semesters", SetupSemesters);
