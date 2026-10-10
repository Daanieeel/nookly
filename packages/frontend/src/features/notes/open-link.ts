import { openUrl } from "@tauri-apps/plugin-opener";
import { parseMentionHref } from "#/features/relationships/mention-utils.ts";
import { armNewTabIntent, useNavStore } from "#/lib/store/nav.ts";

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

/// A click on a link in an editor, as ProseMirror hands it to `handleClickOn`: a mention
/// opens its entity, block or file page, and Cmd or Ctrl opens it in a new tab. ProseMirror
/// reports the click on mouse up, before the tab bar's own `click` listener has seen it, so
/// the new tab intent is armed here. Any other link falls through to `openExternalLink`.
export function openLink(event: MouseEvent, spaceId: string): boolean {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href");
  const mention = href ? parseMentionHref(href) : null;
  if (!mention) return openExternalLink(event);
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) armNewTabIntent();
  const { entityId, blockId, page } = mention;
  useNavStore
    .getState()
    .openEntity(entityId, spaceId, blockId || page ? { entityId, blockId, page } : undefined);
  return true;
}
