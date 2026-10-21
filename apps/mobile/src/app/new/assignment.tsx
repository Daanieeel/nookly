import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewAssignmentScreen } from "../../screens/NewScreens.tsx";

function NewAssignment() {
  const { spaceId, courseId } = useLocalSearchParams<{ spaceId?: string; courseId?: string }>();
  return <NewAssignmentScreen spaceId={spaceId} courseId={courseId} />;
}

export default sheetRoute("New Assignment", NewAssignment);
