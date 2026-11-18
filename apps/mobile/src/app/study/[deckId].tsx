import { useLocalSearchParams } from "expo-router";
import { StudyScreen } from "../../screens/StudyScreen.tsx";

export default function Study() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return <StudyScreen deckId={deckId} />;
}
