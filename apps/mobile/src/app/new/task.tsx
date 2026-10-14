import { useLocalSearchParams } from "expo-router";
import { NewTaskScreen } from "../../screens/NewScreens.tsx";

export default function NewTask() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewTaskScreen spaceId={spaceId} />;
}
