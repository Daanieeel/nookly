import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewCourseScreen } from "../../screens/NewScreens.tsx";

function NewCourse() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewCourseScreen spaceId={spaceId} />;
}

export default sheetRoute("New Course", NewCourse);
