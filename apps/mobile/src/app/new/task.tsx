import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewTaskScreen } from "../../screens/NewScreens.tsx";

function NewTask() {
  const { spaceId, statusId } = useLocalSearchParams<{ spaceId?: string; statusId?: string }>();
  return <NewTaskScreen spaceId={spaceId} statusId={statusId} />;
}

export default sheetRoute("New Task", NewTask);
