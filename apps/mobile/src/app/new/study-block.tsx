import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewStudyBlockScreen } from "../../screens/PlannerScreens.tsx";

function Route() {
  const { spaceId, examId } = useLocalSearchParams<{ spaceId?: string; examId?: string }>();
  return <NewStudyBlockScreen spaceId={spaceId} examId={examId} />;
}

export default sheetRoute("New Study Block", Route);
