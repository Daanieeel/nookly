import { Stack, useLocalSearchParams } from "expo-router";
import { MoodleDiscussionScreen } from "../../../screens/MoodleCourse.tsx";

export default function MoodleDiscussion() {
  const { id, name, courseId } = useLocalSearchParams<{
    id: string;
    name?: string;
    courseId?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Discussion" }} />
      <MoodleDiscussionScreen discussionId={Number(id)} courseId={Number(courseId ?? 0)} />
    </>
  );
}
