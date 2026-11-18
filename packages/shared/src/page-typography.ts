/// The font and size of page text (`notes.editorFont`, `notes.editorFontSize`), shared by the
/// desktop's editor and the phone's.

/// What each `notes.editorFont` choice draws with. Empty means the app's own font.
export const PAGE_FONTS = {
  default: "",
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export type PageFont = keyof typeof PAGE_FONTS;

/// The size pages have had all along: Tailwind's `text-sm`.
export const DEFAULT_PAGE_FONT_SIZE = 14;

/// How much larger than the default a page's text is drawn at `size`.
export function pageScale(size: number): number {
  return size / DEFAULT_PAGE_FONT_SIZE;
}
