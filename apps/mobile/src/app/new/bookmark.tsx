import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewBookmarkScreen } from "../../screens/NewScreens.tsx";

function NewBookmark() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewBookmarkScreen spaceId={spaceId} />;
}

export default sheetRoute("New Bookmark", NewBookmark);
