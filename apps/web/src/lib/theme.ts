export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "nookly.theme";
/// Light unless the visitor picks otherwise.
export const DEFAULT_THEME: Theme = "light";

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" || saved === "system" || saved === "light" ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/// Puts the `.dark` class on the page the way the desktop app does, and remembers the choice.
export function applyTheme(theme: Theme, save = true) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  if (!save) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows may refuse storage; the theme still applies for this visit.
  }
}
