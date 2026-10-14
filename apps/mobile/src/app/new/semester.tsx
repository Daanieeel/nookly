import { useLocalSearchParams } from "expo-router";
import { NewSemesterScreen } from "../../screens/PlannerScreens.tsx";

export default function Route() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewSemesterScreen spaceId={spaceId} />;
}
