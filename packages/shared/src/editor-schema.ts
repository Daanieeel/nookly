import spec from "./generated/editor-schema.json" with { type: "json" };

/// The page editor's schema as plain data, written by the desktop's editor test
/// (`NOOKLY_UPDATE_SNAPSHOTS=1 bun run --cwd packages/frontend test src/features/notes/editor-schema.test.ts`).
/// Any client that edits pages without TipTap builds its editor from this, so the
/// documents it writes are read whole by every other client (DECISIONS.md D6).

export interface SchemaAttr {
  name: string;
  default: string | number | boolean | null;
  required: boolean;
}

export interface SchemaNode {
  name: string;
  content: string | null;
  group: string | null;
  marks: string | null;
  inline: boolean;
  atom: boolean;
  code: boolean;
  defining: boolean;
  isolating: boolean;
  selectable: boolean;
  draggable: boolean;
  attrs: SchemaAttr[];
}

export interface SchemaMark {
  name: string;
  inclusive: boolean;
  excludes: string | null;
  spanning: boolean;
  group: string | null;
  attrs: SchemaAttr[];
}

export interface EditorSchemaSpec {
  topNode: string;
  nodes: SchemaNode[];
  marks: SchemaMark[];
}

export const EDITOR_SCHEMA: EditorSchemaSpec = spec;
