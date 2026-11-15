import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewSemesterScreen } from "../../screens/PlannerScreens.tsx";

function Route() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewSemesterScreen spaceId={spaceId} />;
}

export default sheetRoute("New Semester", Route);
