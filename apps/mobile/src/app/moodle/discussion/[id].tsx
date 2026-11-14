import { Stack, useLocalSearchParams } from "expo-router";
import { MoodleDiscussionScreen } from "../../../screens/MoodleScreens.tsx";

export default function MoodleDiscussion() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Discussion" }} />
      <MoodleDiscussionScreen discussionId={Number(id)} />
    </>
  );
}
