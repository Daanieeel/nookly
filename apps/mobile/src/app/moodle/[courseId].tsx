import { Stack, useLocalSearchParams } from "expo-router";
import { MoodleCourseScreen } from "../../screens/MoodleScreens.tsx";

export default function MoodleCourse() {
  const { courseId, name } = useLocalSearchParams<{ courseId: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Course" }} />
      <MoodleCourseScreen courseId={Number(courseId)} />
    </>
  );
}
