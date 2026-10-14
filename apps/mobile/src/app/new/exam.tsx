import { useLocalSearchParams } from "expo-router";
import { NewExamScreen } from "../../screens/NewScreens.tsx";

export default function NewExam() {
  const { spaceId, courseId } = useLocalSearchParams<{ spaceId?: string; courseId?: string }>();
  return <NewExamScreen spaceId={spaceId} courseId={courseId} />;
}
