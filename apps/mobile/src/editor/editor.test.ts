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
  SLASH_ITEMS,
  active,
  applyMention,
  applySlash,
  blockIds,
  slashMatches,
  toggleHighlight,
  toggleTaskAt,
  triggerAt,
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

/// A state with the text typed and the cursor at its end.
function typed(text: string) {
  const state = EditorState.create({
    schema: pageSchema,
    plugins: [blockIds],
    doc: pageSchema.node("doc", null, [
      pageSchema.node("paragraph", { blockId: "a" }, [pageSchema.text(text)]),
    ]),
  });
  return state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
}

describe("what opens a menu", () => {
  it("opens the block menu for a slash at the start or after a space, with what follows", () => {
    expect(triggerAt(typed("/"))).toMatchObject({ kind: "slash", query: "", from: 1, to: 2 });
    expect(triggerAt(typed("/head"))).toMatchObject({
      kind: "slash",
      query: "head",
      from: 1,
      to: 6,
    });
    expect(triggerAt(typed("Hello /code"))).toMatchObject({
      kind: "slash",
      query: "code",
      from: 7,
      to: 12,
    });
    expect(triggerAt(typed("and/or"))).toBeNull();
    expect(triggerAt(typed("a/b"))).toBeNull();
    expect(triggerAt(typed("Hello"))).toBeNull();
  });

  it("opens the mention menu for an at sign, and closes it when a space ends the word", () => {
    expect(triggerAt(typed("See @Rep"))).toMatchObject({
      kind: "mention",
      query: "Rep",
      from: 5,
      to: 9,
    });
    expect(triggerAt(typed("mail@example"))).toBeNull();
    expect(triggerAt(typed("See @Report now"))).toBeNull();
  });

  it("filters the menu by name or keyword", () => {
    expect(slashMatches("").length).toBe(SLASH_ITEMS.length);
    expect(slashMatches("head").map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(slashMatches("todo").map((i) => i.id)).toEqual(["tasks"]);
    expect(slashMatches("zzz")).toEqual([]);
  });
});

describe("choosing from the menus", () => {
  const item = (id: string) => {
    const found = SLASH_ITEMS.find((i) => i.id === id);
    if (!found) throw new Error(id);
    return found;
  };

  it("replaces the typed text with the block, as one undoable step", () => {
    const state = typed("/head");
    const trigger = triggerAt(state);
    if (!trigger) throw new Error("no trigger");
    const tr = applySlash(state, trigger, item("h2"));
    if (!tr) throw new Error("no step");
    const next = state.apply(tr);
    expect(next.doc.child(0).type.name).toBe("heading");
    expect(next.doc.child(0).attrs).toMatchObject({ level: 2, blockId: "a" });
    expect(next.doc.child(0).textContent).toBe("");
  });

  it("makes lists, quotes, code blocks and dividers", () => {
    const make = (id: string) => {
      const state = typed("/x");
      const trigger = triggerAt(state);
      const tr = trigger ? applySlash(state, trigger, item(id)) : null;
      if (!tr) throw new Error(`${id} did nothing`);
      return state.apply(tr);
    };
    expect(names(make("bullets"))).toEqual(["bulletList", "listItem", "paragraph"]);
    expect(names(make("tasks"))).toEqual(["taskList", "taskItem", "paragraph"]);
    expect(names(make("quote"))).toEqual(["blockquote", "paragraph"]);
    expect(names(make("code"))).toEqual(["codeBlock"]);
    expect(names(make("divider"))).toEqual(["divider", "paragraph"]);
    expect(names(make("callout"))).toEqual(["callout"]);
  });

  it("writes a mention as a link to the item, the way every client does, and a space", () => {
    const state = typed("See @Rep");
    const trigger = triggerAt(state);
    if (!trigger) throw new Error("no trigger");
    const next = state.apply(
      applyMention(state, trigger, { id: "11111111-1111-4111-8111-111111111111", title: "Report" }),
    );
    const paragraph = next.doc.child(0);
    expect(paragraph.textContent).toBe("See Report ");
    const link = paragraph.child(1).marks[0];
    expect(link.type.name).toBe("link");
    expect(link.attrs.href).toBe("mention:11111111-1111-4111-8111-111111111111");
  });
});

describe("checking a task and highlighting", () => {
  it("flips a task item's check from a position inside it, and nothing outside one", () => {
    const state = run(stateOf("x"), toggleTasks).state;
    const flipped = state.apply(toggleTaskAt(state, 3) ?? state.tr);
    let checked: boolean | null = null;
    flipped.doc.descendants((node) => {
      if (node.type.name === "taskItem") checked = node.attrs.checked;
    });
    expect(checked).toBe(true);
    expect(toggleTaskAt(stateOf("plain"), 2)).toBeNull();
  });

  it("highlights a selection", () => {
    const base = stateOf("word");
    const selected = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1, 5)));
    const next = run(selected, toggleHighlight).state;
    expect(next.doc.rangeHasMark(1, 5, pageSchema.marks.highlight)).toBe(true);
    expect(active(next).highlight).toBe(true);
  });
});
