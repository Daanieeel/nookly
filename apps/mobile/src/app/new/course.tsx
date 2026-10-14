import { useLocalSearchParams } from "expo-router";
import { NewCourseScreen } from "../../screens/NewScreens.tsx";

export default function NewCourse() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewCourseScreen spaceId={spaceId} />;
}
