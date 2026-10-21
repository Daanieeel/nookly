import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewSessionScreen } from "../../screens/PlannerScreens.tsx";

function Route() {
  const { spaceId, courseId } = useLocalSearchParams<{ spaceId?: string; courseId?: string }>();
  return <NewSessionScreen spaceId={spaceId} courseId={courseId} />;
}

export default sheetRoute("New Session", Route);
