import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewDeckScreen } from "../../screens/NewScreens.tsx";

function NewDeck() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewDeckScreen spaceId={spaceId} />;
}

export default sheetRoute("New Deck", NewDeck);
