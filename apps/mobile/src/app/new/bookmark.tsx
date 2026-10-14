import { useLocalSearchParams } from "expo-router";
import { NewBookmarkScreen } from "../../screens/NewScreens.tsx";

export default function NewBookmark() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewBookmarkScreen spaceId={spaceId} />;
}
