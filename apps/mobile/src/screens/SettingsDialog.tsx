import { useRouter } from "expo-router";
import { View } from "react-native";
import { useWindowSize } from "../ui/pane.tsx";
import { RouteSheet } from "../ui/sheet/Sheet.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";

/// Room the dialog leaves above and below itself and its title row.
const AROUND = 160;

/// The tallest the dialog's two panes get, the desktop's Settings dialog's.
const TALLEST = 760;

/// A tablet's Settings, the desktop's `SettingsDialog`: an extra large dialog over the
/// window (8.1), the categories on the left and the picked one beside them, each scrolling
/// on its own. Every settings route opens it on its own category.
export function SettingsDialog({ initial }: { initial: string }) {
  const router = useRouter();
  const { height } = useWindowSize();
  return (
    <RouteSheet title="Settings" kind="focus" onClosed={() => router.canGoBack() && router.back()}>
      <View testID="settings-dialog" style={{ height: Math.min(height - AROUND, TALLEST) }}>
        <SettingsScreen initial={initial} />
      </View>
    </RouteSheet>
  );
}
