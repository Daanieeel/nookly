import { useLocalSearchParams } from "expo-router";
import { ImportScreen } from "../../screens/ImportScreen.tsx";

export default function NewImport() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <ImportScreen spaceId={spaceId} />;
}
