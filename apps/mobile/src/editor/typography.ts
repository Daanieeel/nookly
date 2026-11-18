import type { Node } from "prosemirror-model";
import { PAGE_FONTS, type PageFont, pageScale } from "@nookly/shared/page-typography";

/// The most the page grows with the system's text size, as far as the app's own text does
/// (`Label`'s `maxFontSizeMultiplier`).
const MAX_TEXT_SCALE = 2;

/// The page font and size from Settings as CSS variables for the editor's web view, read by
/// its text styles: the same choices the desktop's pages follow, grown with the system's
/// text size (`fontScale`), which a web view does not follow by itself.
export function pageTypographyCss(font: PageFont, size: number, fontScale = 1): string {
  const family = PAGE_FONTS[font];
  const scale = pageScale(size) * Math.min(fontScale, MAX_TEXT_SCALE);
  const vars = [family ? `--page-font: ${family};` : "", `--page-scale: ${scale};`];
  return `:root { ${vars.filter(Boolean).join(" ")} }`;
}

/// Whether a page holds nothing yet: one empty paragraph. It then shows its placeholder.
export function isEmptyPage(doc: Node): boolean {
  const first = doc.firstChild;
  return doc.childCount === 1 && first?.type.name === "paragraph" && first.content.size === 0;
}

/// An empty page's placeholder ("Write something"): drawn over the editor, not in it. A
/// placeholder inside the editable text (a `::before` on its empty line) kept WebKit from
/// showing the caret there and from taking typed text, so tapping an empty page seemed to do
/// nothing.
export const PLACEHOLDER_CSS =
  ".editor-frame { position: relative; display: flex; flex-direction: column; align-self: stretch; width: 100%; } .placeholder { position: absolute; top: 0; left: 0; right: 0; color: var(--muted); white-space: nowrap; overflow: hidden; pointer-events: none; }";
