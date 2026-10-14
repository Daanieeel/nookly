import { Appearance } from "react-native";
import { z } from "zod";
import { create } from "zustand";
import type { Preference } from "./context.tsx";

/// The theme, as on the desktop (`appearance.theme`): light, dark, or the system's.
const themeSchema = z.enum(["system", "light", "dark"]);
export type ThemeChoice = z.infer<typeof themeSchema>;

export const THEME_CHOICES: { choice: ThemeChoice; label: string }[] = [
  { choice: "system", label: "System" },
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
];

/// The chosen theme, so Settings shows it.
export const useThemeChoice = create<{ choice: ThemeChoice }>(() => ({ choice: "system" }));

/// Makes the whole app follow `choice`: the classes' dark values, the system pickers
/// and the bars all go by the app's color scheme, which this sets.
function apply(choice: ThemeChoice) {
  Appearance.setColorScheme(choice === "system" ? "unspecified" : choice);
  useThemeChoice.setState({ choice });
}

/// At start: the theme picked before, or the system's.
export function restoreTheme(saved: Preference) {
  apply(themeSchema.catch("system").parse(saved.get()));
}

export function setTheme(saved: Preference, choice: ThemeChoice) {
  saved.set(choice);
  apply(choice);
}
