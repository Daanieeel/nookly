import { useLocalSearchParams } from "expo-router";
import { NewTaskScreen } from "../../screens/NewScreens.tsx";

export default function NewTask() {
  const { spaceId, statusId } = useLocalSearchParams<{ spaceId?: string; statusId?: string }>();
  return <NewTaskScreen spaceId={spaceId} statusId={statusId} />;
}
