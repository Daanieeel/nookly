/// The look every export shares, so a PDF, a Word file and an OpenDocument file of one page
/// read the same: sizes relative to the body text, and the few colors print uses.

import type { CalloutTone, ExportImage, TableCell, TextRun } from "./document-model.ts";
import type { Size } from "./export-options.ts";

/// Heading sizes as a multiple of the body text size, by level.
export const HEADING_SCALE = { 1: 1.85, 2: 1.5, 3: 1.25, 4: 1.1, 5: 1, 6: 0.95 } as const;

/// The page title above the content, a step larger than a level one heading.
export const TITLE_SCALE = 2.2;

export const CODE_SCALE = 0.88;
export const CAPTION_SCALE = 0.85;

export const COLORS = {
  text: "1F2328",
  muted: "6B7280",
  link: "2563EB",
  border: "D0D7DE",
  codeFill: "F6F8FA",
  headerFill: "F3F4F6",
  barFill: "E5E7EB",
  bar: "4B5563",
  quoteBar: "D0D7DE",
} as const;

/// Highlights, a shade lighter than the editor's swatches so text stays readable in print.
export const HIGHLIGHT_FILLS = {
  yellow: "FEF08A",
  green: "BBF7D0",
  blue: "BFDBFE",
  pink: "FBCFE8",
  orange: "FED7AA",
  purple: "DDD6FE",
} satisfies Record<NonNullable<TextRun["highlight"]>, string>;

export const CALLOUTS = {
  note: { label: "Note", fill: "EFF6FF", accent: "2563EB" },
  tip: { label: "Tip", fill: "F0FDF4", accent: "16A34A" },
  warning: { label: "Warning", fill: "FFFBEB", accent: "D97706" },
  danger: { label: "Danger", fill: "FEF2F2", accent: "DC2626" },
} satisfies Record<CalloutTone, { label: string; fill: string; accent: string }>;

/// Fonts a Word or OpenDocument file names. Those files don't carry their fonts, so they
/// name ones every reader has (or a same size stand in, on Linux). The PDF embeds its own.
export const FONTS = { body: "Arial", mono: "Courier New" } as const;

/// A CSS pixel in points.
export const PX_TO_PT = 0.75;

/// The size an image is placed at, in points: its own size, shrunk to fit `maxWidth` and
/// `maxHeight` while keeping its shape.
export function fitImage(image: ExportImage, maxWidth: number, maxHeight: number): Size {
  const width = image.width * PX_TO_PT;
  const height = image.height * PX_TO_PT;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

/// Inline math is drawn at the size of the text around it: MathJax draws at 16px per em.
export const INLINE_MATH_EM_PX = 16;

/// Column widths in points for the writers that can't size columns to their content (Word
/// and OpenDocument): a `fit` column gets about the width of its longest cell, capped at
/// two fifths of the table, and the `fill` columns share what is left.
export function columnWidths(
  rows: TableCell[][],
  columns: ("fit" | "fill")[] | undefined,
  count: number,
  totalWidth: number,
  size: number,
): number[] {
  const kinds = Array.from({ length: count }, (_, i) => columns?.[i] ?? "fill");
  const fitWidth = (index: number) => {
    const longest = Math.max(
      0,
      ...rows.flatMap((row) =>
        (row[index]?.runs ?? []).map((run) =>
          run.kind === "text" ? Math.max(...run.text.split("\n").map((l) => l.length)) : 4,
        ),
      ),
    );
    return Math.min(totalWidth * 0.4, longest * size * 0.58 + 14);
  };
  const fits = kinds.map((kind, i) => (kind === "fit" ? fitWidth(i) : 0));
  const fills = kinds.filter((kind) => kind === "fill").length;
  const rest = Math.max(0, totalWidth - fits.reduce((a, b) => a + b, 0));
  return kinds.map((kind, i) => (kind === "fit" ? (fits[i] ?? 0) : rest / Math.max(1, fills)));
}
