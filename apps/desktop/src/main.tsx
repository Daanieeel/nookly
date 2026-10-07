import React from "react";
import ReactDOM from "react-dom/client";
import { initPreferences } from "@nookly/frontend/lib/preferences";
import { initSettings } from "@nookly/frontend/lib/settings/settings";
import "@nookly/ui/fonts";
import "@nookly/frontend/styles";

async function start() {
  // Follow the OS theme until the saved one is known, to avoid a light flash.
  document.documentElement.classList.toggle(
    "dark",
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  // Stores read their saved preferences and settings as their modules load, so
  // the app is imported only once both files are in memory. Settings load after
  // preferences because they move old preferences over.
  await initPreferences();
  await initSettings();
  const [{ default: App }, { initTheme }] = await Promise.all([
    import("@nookly/frontend/app"),
    import("@nookly/frontend/lib/theme"),
  ]);
  initTheme();

  // SAFETY: index.html always defines #root.
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
