import { useLocalSearchParams } from "expo-router";
import { SetupSemestersScreen } from "../../screens/SetupSemestersScreen.tsx";

export default function SetupSemesters() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <SetupSemestersScreen spaceId={spaceId} />;
}
