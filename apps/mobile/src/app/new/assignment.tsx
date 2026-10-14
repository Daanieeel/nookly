import { useLocalSearchParams } from "expo-router";
import { NewAssignmentScreen } from "../../screens/NewScreens.tsx";

export default function NewAssignment() {
  const { spaceId, courseId } = useLocalSearchParams<{ spaceId?: string; courseId?: string }>();
  return <NewAssignmentScreen spaceId={spaceId} courseId={courseId} />;
}
