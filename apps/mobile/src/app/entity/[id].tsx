import { useLocalSearchParams } from "expo-router";
import { EntityScreen } from "../../screens/EntityScreen.tsx";

export default function Entity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EntityScreen id={id} />;
}
