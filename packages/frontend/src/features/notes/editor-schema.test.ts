import { getSchema } from "@tiptap/core";
import type { NodeSpec } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions";

/// The page editor's schema, exported for every client that edits pages without the
/// desktop's editor (the phone, through `@nookly/shared/editor-schema`): the same node and
/// mark names, content rules and attribute defaults, so a document written by one is read
/// whole by the other and y-prosemirror never drops what it doesn't know (DECISIONS.md D6).
/// After an intended change, rewrite the file and read the diff:
///
///     bun run --cwd packages/frontend test -u src/features/notes/editor-schema.test.ts

const FILE = "../../../../shared/src/generated/editor-schema.json";

function attrsOf(attrs: NodeSpec["attrs"]) {
  return Object.entries(attrs ?? {}).map(([name, attr]) => ({
    name,
    default: attr.default === undefined ? null : attr.default,
    required: !("default" in attr),
  }));
}

/// What a schema spec says that doesn't depend on code: names, structure, defaults.
function exportSchema() {
  const schema = getSchema(editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }));
  const nodes = Object.entries(schema.nodes).map(([name, { spec }]) => ({
    name,
    content: spec.content ?? null,
    group: spec.group ?? null,
    marks: spec.marks ?? null,
    inline: spec.inline ?? false,
    atom: spec.atom ?? false,
    code: spec.code ?? false,
    defining: spec.defining ?? false,
    isolating: spec.isolating ?? false,
    selectable: spec.selectable ?? true,
    draggable: spec.draggable ?? false,
    attrs: attrsOf(spec.attrs),
  }));
  const marks = Object.entries(schema.marks).map(([name, { spec }]) => ({
    name,
    inclusive: spec.inclusive ?? true,
    excludes: spec.excludes ?? null,
    spanning: spec.spanning ?? true,
    group: spec.group ?? null,
    attrs: attrsOf(spec.attrs),
  }));
  return { topNode: schema.topNodeType.name, nodes, marks };
}

describe("the page editor's schema", () => {
  it("matches the exported file every client builds its editor from", async () => {
    await expect(`${JSON.stringify(exportSchema(), null, 2)}\n`).toMatchFileSnapshot(FILE);
  });
});
