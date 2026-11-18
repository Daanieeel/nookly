import { isModuleKey } from "@nookly/shared/modules";
import { useLocalSearchParams } from "expo-router";
import { ModuleScreen } from "../../../../screens/ModuleScreen.tsx";

export default function Module() {
  const { spaceId, module } = useLocalSearchParams<{ spaceId: string; module: string }>();
  return isModuleKey(module) ? <ModuleScreen spaceId={spaceId} module={module} /> : null;
}
