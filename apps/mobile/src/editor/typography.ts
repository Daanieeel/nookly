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

/// What an empty page says, as the CSS variable its empty paragraph shows (`content:
/// var(--placeholder)`), the text escaped so it stays one CSS string.
export function placeholderStyle(text: string): string {
  return `--placeholder: "${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}";`;
}
