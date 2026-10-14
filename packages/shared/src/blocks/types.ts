/// A page block as the desktop stores it (`blocks`), shared so every client and the
/// server convert between rows and the editor's document the same way.
export interface Block {
  id: string;
  entityId: string;
  position: number;
  blockType: BlockType;
  content: string;
  /// Code block header row (filename + language) — always
  /// `null` for every other block type.
  language: string | null;
  filename: string | null;
  /// Settings of a custom block (callout `variant`, timeline `title`, ...), a toggle
  /// heading's `toggle` or a lettered list's `marker`. Empty on every other block.
  attrs: BlockAttrs;
  createdAt: string;
  updatedAt: string;
}

export type BlockAttrs = Record<string, string>;

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "quote"
  | "code"
  | "bulleted_list"
  | "numbered_list"
  | "table"
  | "image"
  | "embed"
  | "callout"
  | "timeline"
  | "progress"
  | "tree"
  | "steps"
  | "stats"
  | "details"
  | "divider"
  | "checklist"
  | "toggle"
  | "equation"
  | "math"
  | "diagram"
  | "circuit"
  | "entity_card"
  | "video"
  | "audio"
  | "file"
  | "bookmark";
