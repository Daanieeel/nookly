import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { ShareScreen } from "../../screens/ShareScreen.tsx";

function Share() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  return <ShareScreen entityId={entityId} />;
}

// The desktop's Share dialog is a medium one (8.9).
export default sheetRoute("Share", Share, "large", "form");
