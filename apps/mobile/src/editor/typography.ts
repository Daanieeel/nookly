import { PAGE_FONTS, type PageFont, pageScale } from "@nookly/shared/page-typography";

/// The page font and size from Settings as CSS variables for the editor's web view, read by
/// its text styles: the same choices the desktop's pages follow.
export function pageTypographyCss(font: PageFont, size: number): string {
  const family = PAGE_FONTS[font];
  const vars = [family ? `--page-font: ${family};` : "", `--page-scale: ${pageScale(size)};`];
  return `:root { ${vars.filter(Boolean).join(" ")} }`;
}
