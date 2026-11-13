import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewSessionScreen } from "../../screens/PlannerScreens.tsx";

function Route() {
  const { spaceId, courseId, date, start } = useLocalSearchParams<{
    spaceId?: string;
    courseId?: string;
    date?: string;
    start?: string;
  }>();
  return <NewSessionScreen spaceId={spaceId} courseId={courseId} date={date} start={start} />;
}

export default sheetRoute("New Session", Route);
