import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// SAFETY: index.html always defines #root.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
