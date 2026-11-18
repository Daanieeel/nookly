import { PAGE_FONTS, pageScale } from "@nookly/shared/page-typography";
import { settings, subscribeSetting } from "#/lib/settings/settings.ts";

/// The font and size of page text. Two CSS variables on the document, read by `.page-editor`
/// in `styles.css`, so every open page follows a change at once. At the defaults nothing is
/// set and pages look as they always did.

export { DEFAULT_PAGE_FONT_SIZE, PAGE_FONTS } from "@nookly/shared/page-typography";

export function applyPageTypography() {
  const style = document.documentElement.style;
  const font = PAGE_FONTS[settings.get("notes.editorFont")];
  if (font) style.setProperty("--page-font", font);
  else style.removeProperty("--page-font");
  const scale = pageScale(settings.get("notes.editorFontSize"));
  style.setProperty("--page-scale", String(scale));
}

subscribeSetting("notes.editorFont", applyPageTypography);
subscribeSetting("notes.editorFontSize", applyPageTypography);
