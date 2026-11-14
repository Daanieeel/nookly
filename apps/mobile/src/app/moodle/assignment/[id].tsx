import { Stack, useLocalSearchParams } from "expo-router";
import { MoodleAssignmentScreen } from "../../../screens/MoodleCourse.tsx";

export default function MoodleAssignment() {
  const { id, name, courseId } = useLocalSearchParams<{
    id: string;
    name?: string;
    courseId: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Assignment" }} />
      <MoodleAssignmentScreen courseId={Number(courseId)} assignmentId={Number(id)} />
    </>
  );
}
