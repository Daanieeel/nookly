import { useLocalSearchParams } from "expo-router";
import { SpaceScreen } from "../../screens/SpacesScreen.tsx";

export default function Space() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpaceScreen spaceId={id} />;
}
