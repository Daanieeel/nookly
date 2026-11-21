export const THEME_KEY = "nookly-components-theme";

export type Theme = "light" | "dark";

export function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows can refuse storage; the theme still applies for this visit.
  }
}
