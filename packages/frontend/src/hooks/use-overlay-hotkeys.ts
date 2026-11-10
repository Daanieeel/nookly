import { useNavStore } from "#/lib/store/nav.ts";
import { useAppHotkey } from "./use-app-hotkey.ts";

/// The shortcuts of dialogs that load lazily, on their first opening. Registered once at the
/// app root: inside the dialog they would only listen after it had been opened by other means.
export function useOverlayHotkeys() {
  const setNewAssignmentOpen = useNavStore((s) => s.setNewAssignmentOpen);
  const setSettingsOpen = useNavStore((s) => s.setSettingsOpen);
  useAppHotkey("quickAssignment", () => setNewAssignmentOpen(true));
  useAppHotkey("settings", () => setSettingsOpen(!useNavStore.getState().settingsOpen));
}
