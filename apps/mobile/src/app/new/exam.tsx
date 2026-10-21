import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewExamScreen } from "../../screens/NewScreens.tsx";

function NewExam() {
  const { spaceId, courseId } = useLocalSearchParams<{ spaceId?: string; courseId?: string }>();
  return <NewExamScreen spaceId={spaceId} courseId={courseId} />;
}

export default sheetRoute("New Exam", NewExam);
