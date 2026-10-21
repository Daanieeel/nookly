import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { ImportScreen } from "../../screens/ImportScreen.tsx";

function NewImport() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <ImportScreen spaceId={spaceId} />;
}

export default sheetRoute("Import a File", NewImport, "large");
