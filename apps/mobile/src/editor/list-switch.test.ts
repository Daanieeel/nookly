import { EditorState, TextSelection } from "prosemirror-state";
import { indent, outdent, toggleBullets, toggleNumbers, toggleTasks } from "./commands.ts";
import { pageSchema as schema } from "./schema.ts";

const { doc, paragraph, bulletList, listItem, taskItem } = schema.nodes;

/// A page with a bulleted list of two items, the cursor in the first.
function bullets() {
  const page = doc.create(null, [
    bulletList.create(null, [
      listItem.create(null, paragraph.create(null, schema.text("one"))),
      listItem.create(null, paragraph.create(null, schema.text("two"))),
    ]),
  ]);
  const state = EditorState.create({ schema, doc: page });
  return state.apply(state.tr.setSelection(TextSelection.create(page, 3)));
}

function run(state: EditorState, command: typeof toggleBullets) {
  let next = state;
  command(state, (tr) => (next = state.apply(tr)));
  return next;
}

const lists = (state: EditorState) => {
  const names: string[] = [];
  state.doc.forEach((node) => names.push(node.type.name));
  return names;
};

describe("switching a list to another kind", () => {
  it("turns a bulleted list into a numbered one, keeping its items and the cursor", () => {
    const next = run(bullets(), toggleNumbers);
    expect(lists(next)).toEqual(["orderedList"]);
    expect(next.doc.firstChild?.childCount).toBe(2);
    expect(next.doc.textContent).toBe("onetwo");
    expect(next.selection.from).toBe(3);
  });

  it("turns a bulleted list into a task list, each item a task not done", () => {
    const next = run(bullets(), toggleTasks);
    expect(lists(next)).toEqual(["taskList"]);
    next.doc.firstChild?.forEach((item) => {
      expect(item.type).toBe(taskItem);
      expect(item.attrs.checked).toBe(false);
    });
  });

  it("turns a task list back into bullets", () => {
    const next = run(run(bullets(), toggleTasks), toggleBullets);
    expect(lists(next)).toEqual(["bulletList"]);
    expect(next.doc.firstChild?.firstChild?.type).toBe(listItem);
  });

  it("still takes the item out of its list when the same kind is tapped", () => {
    const next = run(bullets(), toggleBullets);
    expect(lists(next)[0]).toBe("paragraph");
  });
});

describe("whether indenting can do anything", () => {
  it("can't indent the first item of a list, nor outdent from no list", () => {
    const state = bullets();
    expect(indent(state)).toBe(false);
    const plain = EditorState.create({
      schema,
      doc: doc.create(null, paragraph.create(null, schema.text("x"))),
    });
    expect(outdent(plain)).toBe(false);
  });

  it("can indent the second item", () => {
    const state = bullets();
    const second = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9)));
    expect(indent(second)).toBe(true);
  });
});
