import { useLocalSearchParams } from "expo-router";
import { ShareScreen } from "../../screens/ShareScreen.tsx";

export default function Share() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  return <ShareScreen entityId={entityId} />;
}
