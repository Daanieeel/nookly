import { Stack, useLocalSearchParams } from "expo-router";
import { MoodleForumScreen } from "../../../screens/MoodleCourse.tsx";

export default function MoodleForum() {
  const { id, name, courseId, spaceId } = useLocalSearchParams<{
    id: string;
    name?: string;
    courseId: string;
    spaceId?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Forum" }} />
      <MoodleForumScreen courseId={Number(courseId)} forumId={Number(id)} spaceId={spaceId ?? ""} />
    </>
  );
}
