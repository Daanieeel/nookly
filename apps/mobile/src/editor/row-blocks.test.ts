/** @jest-environment jsdom */
import type { Attrs } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { rowBlockView } from "./row-blocks.ts";
import { ROW_BLOCK_TYPES, type RowBlockType, nextTimelineState, shiftTree } from "./row-model.ts";
import { pageSchema as schema } from "./schema.ts";

// The row blocks are forms in the page: what is typed in them is written to the block's
// `rows` at once, in the line format every client reads.
function open(type: RowBlockType, attrs: Attrs = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const block = schema.nodes[type].create({ rows: "", ...attrs });
  const doc = schema.nodes.doc.create(null, [block, schema.nodes.paragraph.create()]);
  const view = new EditorView(host, {
    state: EditorState.create({ doc }),
    nodeViews: { [type]: rowBlockView(type, { editable: () => true, caret: () => {} }) },
  });
  const attr = (name: string) => String(view.state.doc.child(0).attrs[name] ?? "");
  const inputs = () => [...host.querySelectorAll<HTMLInputElement>(".rb-row input")];
  const press = (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    if (!button) throw new Error(`no button ${label}`);
    button.click();
  };
  const type_ = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return {
    host,
    view,
    attr,
    inputs,
    press,
    type: type_,
    rows: () => host.querySelectorAll(".rb-row"),
  };
}

describe("a steps block", () => {
  it("writes the steps as they are typed, and keeps the field you are typing in", () => {
    const b = open("steps");
    const [title] = b.inputs();
    b.type(title, "Boil water");
    expect(b.attr("rows")).toBe("Boil water");
    // The field is not drawn again while you type, so the keyboard stays up.
    expect(b.inputs()[0]).toBe(title);
    b.type(b.inputs()[1], "Use a big pot");
    expect(b.attr("rows")).toBe("Boil water\tUse a big pot");
  });

  it("adds and removes steps, and marks the one you are on", () => {
    const b = open("steps", { rows: "One\nTwo" });
    b.press("Add step");
    expect(b.rows()).toHaveLength(3);
    b.press("Mark as Current: step 2");
    expect(b.attr("current")).toBe("2");
    b.press("Mark as Done: step 2");
    expect(b.attr("current")).toBe("3");
    b.press("Remove Step");
    expect(b.rows().length).toBeGreaterThanOrEqual(1);
  });

  it("takes the block out of the page when its last row is removed", () => {
    const b = open("steps", { rows: "Only" });
    b.press("Remove Step");
    expect(b.view.state.doc.child(0).type.name).toBe("paragraph");
  });

  it("names the block", () => {
    const b = open("steps");
    const title = b.host.querySelector<HTMLInputElement>(".rb-title");
    if (!title) throw new Error("no title");
    b.type(title, "Pasta");
    expect(b.attr("title")).toBe("Pasta");
  });
});

describe("the other row blocks", () => {
  it("keeps stats to four", () => {
    const b = open("stats", { rows: "1\ta\n2\tb\n3\tc" });
    b.press("Add stat");
    expect(b.rows()).toHaveLength(4);
    expect(b.host.querySelector(".rb-add")).toBeNull();
  });

  it("writes a progress goal's value and target as numbers", () => {
    const b = open("progress", { rows: "Read\t3\t10" });
    const [, value] = b.inputs();
    b.type(value, "7");
    expect(b.attr("rows")).toBe("Read\t7\t10");
    b.type(value, "nonsense");
    expect(b.attr("rows")).toBe("Read\t0\t10");
  });

  it("moves a timeline event from done to now to next", () => {
    const b = open("timeline", { rows: "Mon\tStart" });
    b.press("Mark as now: row 1");
    expect(b.attr("rows")).toBe("Mon\tStart\tnow");
    b.press("Mark as next: row 1");
    expect(b.attr("rows")).toBe("Mon\tStart\tnext");
    expect(nextTimelineState("next")).toBe("done");
  });

  it("nests a tree item with its children, never past the item above", () => {
    const b = open("tree", { rows: "A\nB\n  C" });
    const rows = b.rows();
    expect(rows).toHaveLength(3);
    const indent = rows[1].querySelector<HTMLButtonElement>('[aria-label="Indent"]');
    indent?.click();
    expect(b.attr("rows")).toBe("A\n  B\n    C");
    // Out again.
    b.host.querySelectorAll<HTMLButtonElement>('[aria-label="Outdent"]')[1].click();
    expect(b.attr("rows")).toBe("A\nB\n  C");
    expect(shiftTree([["0", "A"]], 0, 1)).toEqual([["0", "A"]]);
  });

  it("edits details as label and value pairs", () => {
    const b = open("details", { rows: "Room\t4.12" });
    const [label] = b.inputs();
    b.type(label, "Office");
    expect(b.attr("rows")).toBe("Office\t4.12");
  });
});

describe("every row block", () => {
  it("has a view the page can draw", () => {
    for (const type of ROW_BLOCK_TYPES) {
      const b = open(type);
      expect(b.host.querySelector(`[data-node="${type}"]`)).toBeTruthy();
    }
  });
});
