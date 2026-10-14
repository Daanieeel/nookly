import { useLocalSearchParams } from "expo-router";
import { NewPageScreen } from "../../screens/NewScreens.tsx";

export default function NewPage() {
  const { spaceId, type } = useLocalSearchParams<{ spaceId?: string; type?: string }>();
  return <NewPageScreen spaceId={spaceId} type={type === "jot" ? "jot" : "note"} />;
}
