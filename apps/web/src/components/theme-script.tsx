import { DEFAULT_THEME, THEME_KEY } from "@/lib/theme";

/// Sets the saved theme (light by default) before the first paint, so there is no flash,
/// and follows the system while "system" is picked.
const SCRIPT = `(() => {
  let theme = "${DEFAULT_THEME}";
  try { theme = localStorage.getItem("${THEME_KEY}") || theme; } catch {}
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    let current = theme;
    try { current = localStorage.getItem("${THEME_KEY}") || "${DEFAULT_THEME}"; } catch {}
    const dark = current === "dark" || (current === "system" && media.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  };
  apply();
  media.addEventListener("change", apply);
})();`;

export function ThemeScript() {
  // oxlint-disable-next-line react/no-danger -- a fixed string, no user input
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
