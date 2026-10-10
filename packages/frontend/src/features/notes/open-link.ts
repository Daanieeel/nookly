import { openUrl } from "@tauri-apps/plugin-opener";

/// Links the app may hand to the system: web and mail addresses only, never a file path
/// or a script.
const OPENABLE = /^(https?:|mailto:)/i;

/// Cmd (Ctrl on Windows and Linux) plus a click on a link in text opens it in the
/// browser or mail app. A plain click is left to the editor, so it still places the caret.
/// Returns whether it handled the click, for ProseMirror's `handleClickOn`.
export function openExternalLink(event: MouseEvent): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href");
  if (!href || !OPENABLE.test(href)) return false;
  event.preventDefault();
  void openUrl(href);
  return true;
}
