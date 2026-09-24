import React from "react";
import ReactDOM from "react-dom/client";
import { initPreferences } from "./lib/preferences";
// Bundled rather than fetched: the app runs offline, so fonts ship with the binary.
import "@fontsource-variable/inter";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource-variable/inter-tight";
import "./styles.css";
import "blobatar/motion.css";
import "blobatar/gaze.css";

async function start() {
  // Follow the OS theme until the saved one is known, to avoid a light flash.
  document.documentElement.classList.toggle(
    "dark",
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  // Stores read their saved preferences as their modules load, so the app is
  // imported only once the preferences file is in memory.
  await initPreferences();
  const [{ default: App }, { initTheme }] = await Promise.all([
    import("./App"),
    import("./lib/theme"),
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
