import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewPageScreen } from "../../screens/NewScreens.tsx";

function NewPage() {
  const { spaceId, type } = useLocalSearchParams<{ spaceId?: string; type?: string }>();
  return <NewPageScreen spaceId={spaceId} type={type === "jot" ? "jot" : "note"} />;
}

export default sheetRoute("New Page", NewPage);
