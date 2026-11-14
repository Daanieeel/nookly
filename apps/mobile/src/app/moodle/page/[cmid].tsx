import { Stack, useLocalSearchParams } from "expo-router";
import { MoodlePageScreen } from "../../../screens/MoodleCourse.tsx";

export default function MoodlePage() {
  const { cmid, name, courseId } = useLocalSearchParams<{
    cmid: string;
    name?: string;
    courseId: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Page" }} />
      <MoodlePageScreen courseId={Number(courseId)} cmid={Number(cmid)} />
    </>
  );
}
