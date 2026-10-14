import { Stack, useLocalSearchParams } from "expo-router";
import { SettingsCategoryScreen, settingsTitle } from "../../screens/SettingsScreen.tsx";

export default function SettingsPageRoute() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return (
    <>
      <Stack.Screen options={{ title: settingsTitle(page) }} />
      <SettingsCategoryScreen page={page} />
    </>
  );
}
