/// A page laid out for print: the one shape the PDF, Word and OpenDocument writers read.
/// Every block type turns into these few pieces (`page-document.ts`), so each writer
/// only knows how to draw them, never the blocks themselves.

import type { HighlightColorId } from "#/features/notes/highlight-colors.ts";
import type { TextColorId } from "#/features/notes/text-colors.ts";

/// A picture ready to place: PNG bytes and the size it shows at, in CSS pixels.
export interface ExportImage {
  png: Uint8Array;
  width: number;
  height: number;
}

export interface TextRun {
  kind: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /// `"yellow"` for the default highlight.
  highlight?: HighlightColorId | "yellow";
  /// The text colour, drawn under a link's or a hint's own colour.
  color?: TextColorId;
  link?: string;
  /// Drawn in the muted text color: a hint, a date, a state.
  muted?: boolean;
}

/// Inline math. `image` is the formula drawn, filled in before writing when it could be;
/// without one the writers show the LaTeX itself.
interface MathRun {
  kind: "math";
  latex: string;
  image?: ExportImage;
}

export type Run = TextRun | MathRun;

export interface ListItem {
  runs: Run[];
  /// The marker in front of the item as the editor shows it (`1.`, `b)`, `•`).
  marker: string;
  /// A checklist item: whether it is done.
  checked?: boolean;
  children: ListItem[];
}

export interface TableCell {
  runs: Run[];
  /// The cell shows a bar filled to this share (0 to 1), next to its text.
  bar?: number;
}

export type CalloutTone = "note" | "tip" | "warning" | "danger";

export type ExportBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: Run[] }
  | { kind: "paragraph"; runs: Run[]; align?: "center" }
  /// A short bold line above a framed block, its optional title.
  | { kind: "caption-title"; text: string }
  | { kind: "list"; items: ListItem[] }
  | { kind: "code"; text: string; label?: string }
  | { kind: "quote"; runs: Run[] }
  | { kind: "callout"; tone: CalloutTone; runs: Run[] }
  | {
      kind: "table";
      header: boolean;
      rows: TableCell[][];
      /// `rows` draws only lines between rows, for a custom block laid out as a table
      /// (timeline, progress, details); `grid` draws every cell, for a real table.
      lines?: "rows" | "grid";
      /// How wide each column is: `fit` as wide as its widest cell, `fill` sharing the rest.
      /// Every column fills when unset.
      columns?: ("fit" | "fill")[];
    }
  | { kind: "rule" }
  /// A drawn figure (formula, diagram, circuit, picture). Without an image the writers
  /// show `fallback` as code, so nothing goes missing when drawing failed.
  | {
      kind: "figure";
      source: FigureSource;
      image?: ExportImage;
      fallback: string;
      caption?: string;
    };

/// What a figure is drawn from, read by `resolveFigures` before writing.
export type FigureSource =
  | { type: "math"; latex: string }
  | { type: "diagram"; source: string }
  | { type: "circuit"; source: string }
  | { type: "plot"; source: string }
  /// An image file the page shows, by File id or URL.
  | { type: "image"; fileId?: string; url?: string };

export interface ExportDocument {
  title: string;
  blocks: ExportBlock[];
}
