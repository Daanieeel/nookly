import { useLocalSearchParams } from "expo-router";
import { SpaceSettingsScreen } from "../../screens/SpaceSettings.tsx";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpaceSettingsScreen spaceId={id} />;
}
