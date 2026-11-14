import { Stack, useLocalSearchParams } from "expo-router";
import { MoodleCourseScreen } from "../../screens/MoodleCourse.tsx";

export default function MoodleCourse() {
  const { courseId, name, spaceId } = useLocalSearchParams<{
    courseId: string;
    name?: string;
    spaceId?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Course" }} />
      <MoodleCourseScreen courseId={Number(courseId)} spaceId={spaceId ?? ""} />
    </>
  );
}
