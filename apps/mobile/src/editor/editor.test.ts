import {
  type Block,
  PAGE_FRAGMENT,
  nodeToBlockInput,
  readNodes,
  seedPage,
} from "@nookly/shared/blocks";
import { EDITOR_SCHEMA } from "@nookly/shared/editor-schema";
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import { splitBlock } from "prosemirror-commands";
import { type Command, EditorState, TextSelection } from "prosemirror-state";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "./bridge.ts";
import {
  active,
  blockIds,
  toggleBold,
  toggleBullets,
  toggleHeading,
  toggleQuote,
  toggleTasks,
} from "./commands.ts";
import { pageSchema } from "./schema.ts";

const STAMP = "2026-10-01T00:00:00Z";

const block = (patch: Partial<Block> & Pick<Block, "id" | "blockType" | "content">): Block => ({
  entityId: "e",
  position: 0,
  language: null,
  filename: null,
  attrs: {},
  createdAt: STAMP,
  updatedAt: STAMP,
  ...patch,
});

/// The same kinds of block the desktop's own document test holds its editor to.
const BLOCKS: Block[] = [
  block({ id: "b1", blockType: "heading2", content: "Week **one**" }),
  block({
    id: "b2",
    blockType: "paragraph",
    content: "Some *notes* with `code`, [a link](https://example.com) and $x^2$.",
  }),
  block({ id: "b3", blockType: "bulleted_list", content: "first\nsecond" }),
  block({ id: "b4", blockType: "numbered_list", content: "one\ntwo" }),
  block({ id: "b5", blockType: "checklist", content: "[ ] todo\n[x] done" }),
  block({ id: "b6", blockType: "quote", content: "A quote" }),
  block({
    id: "b7",
    blockType: "code",
    content: "fn main() {}",
    language: "rust",
    filename: "main.rs",
  }),
  block({ id: "b8", blockType: "callout", content: "Careful", attrs: { variant: "warning" } }),
  block({ id: "b9", blockType: "divider", content: "" }),
  block({ id: "b10", blockType: "math", content: "e^{i\\pi} + 1 = 0" }),
  block({
    id: "b11",
    blockType: "timeline",
    content: "done|Kick off\nnow|Build",
    attrs: { title: "Plan" },
  }),
].map((b, position) => ({ ...b, position }));

function seeded() {
  const doc = new Y.Doc();
  seedPage(doc, BLOCKS);
  return doc;
}

describe("the phone's page schema", () => {
  it("has every node and mark of the desktop's editor, and no other", () => {
    expect(Object.keys(pageSchema.nodes).sort()).toEqual(
      EDITOR_SCHEMA.nodes.map((n) => n.name).sort(),
    );
    expect(Object.keys(pageSchema.marks).sort()).toEqual(
      EDITOR_SCHEMA.marks.map((m) => m.name).sort(),
    );
  });

  it("reads every kind of block of a shared page document as valid content", () => {
    const fragment = seeded().getXmlFragment(PAGE_FRAGMENT);
    const root = yXmlFragmentToProseMirrorRootNode(fragment, pageSchema);
    root.check();
    expect(root.childCount).toBe(BLOCKS.length);
    expect(root.child(0).type.name).toBe("heading");
    expect(root.child(0).attrs.blockId).toBe("b1");
  });

  it("writes back exactly what it read, so nothing is dropped", () => {
    const original = seeded();
    const root = yXmlFragmentToProseMirrorRootNode(
      original.getXmlFragment(PAGE_FRAGMENT),
      pageSchema,
    );
    const copy = new Y.Doc();
    prosemirrorToYXmlFragment(root, copy.getXmlFragment(PAGE_FRAGMENT));
    // As blocks, the way rows and the server read them: attributes the schema fills in
    // with defaults (a link's `rel`) are not a difference.
    const blocks = (doc: Y.Doc) =>
      readNodes(doc.getXmlFragment(PAGE_FRAGMENT)).map(nodeToBlockInput);
    expect(blocks(copy)).toEqual(blocks(original));
    expect(blocks(copy).map((b) => b?.blockId)).toEqual(BLOCKS.map((b) => b.id));
  });
});

describe("swapping updates as text", () => {
  it("brings a second document to the same page, in any order and more than once", () => {
    const a = seeded();
    const update = toBase64(Y.encodeStateAsUpdate(a));
    const b = new Y.Doc();
    Y.applyUpdate(b, fromBase64(update));
    Y.applyUpdate(b, fromBase64(update));
    expect(readNodes(b.getXmlFragment(PAGE_FRAGMENT))).toEqual(
      readNodes(a.getXmlFragment(PAGE_FRAGMENT)),
    );
  });
});

function stateOf(text: string, at = 0) {
  const state = EditorState.create({
    schema: pageSchema,
    plugins: [blockIds],
    doc: pageSchema.node("doc", null, [
      pageSchema.node("paragraph", { blockId: "a" }, text ? [pageSchema.text(text)] : []),
    ]),
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + at)));
}

function run(state: EditorState, command: Command) {
  let next = state;
  const ok = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { ok, state: next };
}

const names = (state: EditorState) => {
  const out: string[] = [];
  state.doc.descendants((node) => {
    if (node.isBlock) out.push(node.type.name);
  });
  return out;
};

describe("the editor's commands", () => {
  it("gives the block made by pressing Enter an id of its own", () => {
    const { state } = run(stateOf("ab", 1), splitBlock);
    const ids = [state.doc.child(0).attrs.blockId, state.doc.child(1).attrs.blockId];
    expect(state.doc.childCount).toBe(2);
    expect(ids[0]).toBe("a");
    expect(ids[1]).toMatch(/^blk_/);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("makes a heading, and a paragraph again when it already is one", () => {
    const heading = run(stateOf("Title"), toggleHeading(2)).state;
    expect(heading.doc.child(0).type.name).toBe("heading");
    expect(heading.doc.child(0).attrs.level).toBe(2);
    expect(heading.doc.child(0).attrs.blockId).toBe("a");
    expect(run(heading, toggleHeading(2)).state.doc.child(0).type.name).toBe("paragraph");
  });

  it("makes lists and task lists, and takes the block out again", () => {
    const bullets = run(stateOf("x"), toggleBullets).state;
    expect(names(bullets)).toEqual(["bulletList", "listItem", "paragraph"]);
    expect(active(bullets).bullets).toBe(true);
    expect(names(run(bullets, toggleBullets).state)).toEqual(["paragraph"]);
    const tasks = run(stateOf("x"), toggleTasks).state;
    expect(names(tasks)).toEqual(["taskList", "taskItem", "paragraph"]);
  });

  it("quotes a block, and lifts it out", () => {
    const quoted = run(stateOf("x"), toggleQuote).state;
    expect(names(quoted)).toEqual(["blockquote", "paragraph"]);
    expect(names(run(quoted, toggleQuote).state)).toEqual(["paragraph"]);
  });

  it("turns bold on at the cursor and for a selection", () => {
    const typing = run(stateOf("x", 1), toggleBold).state;
    expect(active(typing).bold).toBe(true);
    const base = stateOf("word");
    const selected = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1, 5)));
    const bold = run(selected, toggleBold).state;
    expect(bold.doc.rangeHasMark(1, 5, pageSchema.marks.bold)).toBe(true);
  });
});
