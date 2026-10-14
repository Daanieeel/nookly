import { useLocalSearchParams } from "expo-router";
import { NewSessionScreen } from "../../screens/PlannerScreens.tsx";

export default function Route() {
  const { spaceId, courseId } = useLocalSearchParams<{ spaceId?: string; courseId?: string }>();
  return <NewSessionScreen spaceId={spaceId} courseId={courseId} />;
}
