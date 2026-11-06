import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { ignoreError } from "#/lib/log.ts";

/// Web and mail addresses: the links that belong to the system, never to Nookly's own window.
const EXTERNAL = /^(https?:|mailto:)/i;

/// Every web or mail link, wherever it sits, opens in the default browser or mail app and
/// never navigates Nookly's own window. It runs after the handlers of the page, so a link
/// something else already took (a mention, a Moodle link, a Cmd click in an editor) is left
/// alone, and so is a link in text being edited, where a click places the caret.
export function useExternalLinks() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      const href = link?.getAttribute("href");
      if (!link || !href || !EXTERNAL.test(href)) return;
      if (link.closest("[contenteditable]:not([contenteditable=false])")) return;
      event.preventDefault();
      void openUrl(href).catch(ignoreError("opening a link"));
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
