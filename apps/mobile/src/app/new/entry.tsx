import { useLocalSearchParams } from "expo-router";
import { NewEntryScreen } from "../../screens/NewScreens.tsx";

export default function NewEntry() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewEntryScreen spaceId={spaceId} />;
}
