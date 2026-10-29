import { openUrl } from "@tauri-apps/plugin-opener";
import {
  type MentionTarget,
  isEntityKey,
  parseMentionHref,
} from "#/features/relationships/mention-utils.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { parseDeepLink } from "#/lib/deep-link-url.ts";
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
  if (href && !mention && parseDeepLink(href)) {
    // A `nookly://` link in a page opens right here, without a trip through the system.
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) armNewTabIntent();
    void import("#/lib/deep-link.ts").then((m) => m.openDeepLink(href));
    return true;
  }
  if (!mention) return openExternalLink(event);
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) armNewTabIntent();
  const { entityId } = mention;
  if (isEntityKey(entityId)) {
    // A mention written with its readable key opens the page that key names. A key that
    // names nothing opens nothing.
    getEntity(entityId)
      .then((entity) => openMention(mention, entity))
      .catch(() => {});
  } else {
    openMention(mention, { id: entityId, spaceId });
  }
  return true;
}

/// Opens what a mention points at, in `entity`'s own Space: the entity, and the block of a
/// page, the page of a file, or the row or column of a table it names.
export function openMention(
  { blockId, page, row, column }: MentionTarget,
  entity: { id: string; spaceId: string },
) {
  useNavStore
    .getState()
    .openEntity(
      entity.id,
      entity.spaceId,
      blockId || page ? { entityId: entity.id, blockId, page, row, column } : undefined,
    );
}
