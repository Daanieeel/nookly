import { useLocalSearchParams } from "expo-router";
import { NewStudyBlockScreen } from "../../screens/PlannerScreens.tsx";

export default function Route() {
  const { spaceId, examId } = useLocalSearchParams<{ spaceId?: string; examId?: string }>();
  return <NewStudyBlockScreen spaceId={spaceId} examId={examId} />;
}
