import { Stack, useLocalSearchParams } from "expo-router";
import { SettingsDialog } from "../../screens/SettingsDialog.tsx";
import { SettingsCategoryScreen, settingsTitle } from "../../screens/SettingsScreen.tsx";
import { useIsTablet } from "../../ui/pane.tsx";

export default function SettingsPageRoute() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const tablet = useIsTablet();
  if (tablet) return <SettingsDialog initial={page ?? "general"} />;
  return (
    <>
      <Stack.Screen options={{ title: settingsTitle(page) }} />
      <SettingsCategoryScreen page={page} />
    </>
  );
}
