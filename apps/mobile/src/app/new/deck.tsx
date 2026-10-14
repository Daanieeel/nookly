import { useLocalSearchParams } from "expo-router";
import { NewDeckScreen } from "../../screens/NewScreens.tsx";

export default function NewDeck() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewDeckScreen spaceId={spaceId} />;
}
