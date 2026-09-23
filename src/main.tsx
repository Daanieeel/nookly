import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
// Bundled rather than fetched: the app runs offline, so fonts ship with the binary.
import "@fontsource-variable/inter";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource-variable/inter-tight";
import "./styles.css";
import "blobatar/motion.css";
import "blobatar/gaze.css";

initTheme();

// SAFETY: index.html always defines #root.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
