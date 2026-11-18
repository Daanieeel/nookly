import { useLocalSearchParams, useRouter } from "expo-router";
import { SpaceSettingsScreen } from "../../screens/SpaceSettings.tsx";
import { useIsTablet } from "../../ui/pane.tsx";
import { RouteSheet } from "../../ui/sheet/Sheet.tsx";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tablet = useIsTablet();
  const router = useRouter();
  // A tablet's is the desktop's Space Settings dialog over the window (6.12).
  if (tablet) {
    return (
      <RouteSheet
        title="Space Settings"
        kind="flow"
        onClosed={() => router.canGoBack() && router.back()}
      >
        <SpaceSettingsScreen spaceId={id} />
      </RouteSheet>
    );
  }
  return <SpaceSettingsScreen spaceId={id} />;
}
