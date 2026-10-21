import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { ShareScreen } from "../../screens/ShareScreen.tsx";

function Share() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  return <ShareScreen entityId={entityId} />;
}

export default sheetRoute("Share", Share, "large");
