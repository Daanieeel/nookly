import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
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
