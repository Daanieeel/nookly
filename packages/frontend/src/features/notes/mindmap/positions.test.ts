import { describe, expect, it } from "vitest";
import {
  offsetsFor,
  readLayout,
  reconcileLayout,
  resetLayout,
  setOffset,
  type MindLayout,
} from "./positions";

/// Ids that read like their line, so a test shows who kept what.
function counter() {
  let n = 0;
  return () => `n${++n}`;
}

function layoutOf(ids: string[], positions: MindLayout["positions"]): string {
  return JSON.stringify({ v: 1, ids, positions });
}

const read = (raw: string) => {
  const parsed = readLayout(raw);
  if (parsed.kind !== "known") throw new Error(`not known: ${parsed.kind}`);
  return parsed.layout;
};

const OLD = "Plan\n  Read\n  Write\n  Rest";
const BASE = layoutOf(["p", "r", "w", "e"], {
  r: { x: 10, y: 5 },
  w: { x: -4, y: 8 },
});

describe("reconcileLayout", () => {
  it("keeps every id when nothing changed", () => {
    expect(reconcileLayout(OLD, OLD, BASE, counter())).toBe(BASE);
  });

  it("gives a new line a fresh id and keeps the others", () => {
    const next = reconcileLayout(OLD, "Plan\n  Read\n  Draft\n  Write\n  Rest", BASE, counter());
    const layout = read(next);
    expect(layout.ids).toEqual(["p", "r", "n1", "w", "e"]);
    expect(layout.positions).toEqual({ r: { x: 10, y: 5 }, w: { x: -4, y: 8 } });
  });

  it("drops the id and the position of a deleted line", () => {
    const layout = read(reconcileLayout(OLD, "Plan\n  Read\n  Rest", BASE, counter()));
    expect(layout.ids).toEqual(["p", "r", "e"]);
    expect(layout.positions).toEqual({ r: { x: 10, y: 5 } });
  });

  it("keeps the id of a line edited in place, whatever the edit", () => {
    const renamed = read(
      reconcileLayout(OLD, "Plan\n  Read more\n  Write\n  Rest", BASE, counter()),
    );
    expect(renamed.ids).toEqual(["p", "r", "w", "e"]);
    expect(renamed.positions.r).toEqual({ x: 10, y: 5 });
    // Indenting a line changes its text too.
    const indented = read(reconcileLayout(OLD, "Plan\n  Read\n    Write\n  Rest", BASE, counter()));
    expect(indented.ids).toEqual(["p", "r", "w", "e"]);
  });

  it("keeps ids with their lines when lines are reordered", () => {
    const layout = read(reconcileLayout(OLD, "Plan\n  Write\n  Rest\n  Read", BASE, counter()));
    expect(layout.ids).toEqual(["p", "w", "e", "r"]);
    expect(layout.positions).toEqual({ r: { x: 10, y: 5 }, w: { x: -4, y: 8 } });
  });

  it("keeps ids through an insert and an edit in the same place", () => {
    // One line edited and one added right next to it: the edited line is not told apart from
    // the new one, but the lines around them keep theirs.
    const layout = read(
      reconcileLayout(OLD, "Plan\n  Read\n  Write now\n  Also\n  Rest", BASE, counter()),
    );
    expect(layout.ids[0]).toBe("p");
    expect(layout.ids[1]).toBe("r");
    expect(layout.ids[4]).toBe("e");
    expect(new Set(layout.ids).size).toBe(5);
  });

  it("cleans up positions whose line is gone and drops an empty layout", () => {
    const only = layoutOf(["p", "r"], { r: { x: 1, y: 1 } });
    expect(reconcileLayout("Plan\n  Read", "Plan", only, counter())).toBe("");
  });

  it("is deterministic and never reuses an id inside one block", () => {
    const text = "a\na\na\nb";
    const raw = layoutOf(["1", "2", "3", "4"], { "2": { x: 3, y: 3 } });
    const next = reconcileLayout(text, "a\na\nb\na\na", raw, counter());
    expect(next).toBe(reconcileLayout(text, "a\na\nb\na\na", raw, counter()));
    expect(new Set(read(next).ids).size).toBe(5);
  });

  it("leaves a layout from a newer version as it is", () => {
    const future = JSON.stringify({ v: 2, anything: true });
    expect(reconcileLayout(OLD, "Plan", future, counter())).toBe(future);
  });

  it("clears ids that no longer line up with the text they were made for", () => {
    const stale = layoutOf(["p", "r"], { r: { x: 1, y: 1 } });
    expect(reconcileLayout(OLD, `${OLD}\n  More`, stale, counter())).toBe("");
  });

  it("does nothing for a block with no layout, such as a pasted outline", () => {
    expect(reconcileLayout(OLD, "Pasted\n  Outline", "", counter())).toBe("");
  });

  it("copes with a long outline", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `  line ${i}`);
    const ids = lines.map((_, i) => `i${i}`);
    const raw = layoutOf(ids, { i300: { x: 9, y: 9 } });
    const edited = [...lines.slice(0, 100), "  new", ...lines.slice(100)];
    const layout = read(reconcileLayout(lines.join("\n"), edited.join("\n"), raw, counter()));
    expect(layout.ids[101]).toBe("i100");
    expect(layout.positions).toEqual({ i300: { x: 9, y: 9 } });
  });
});

describe("readLayout", () => {
  it("tells apart no layout, a known one, a newer one and garbage", () => {
    expect(readLayout("").kind).toBe("none");
    expect(readLayout(layoutOf(["a"], {})).kind).toBe("known");
    expect(readLayout('{"v":2}').kind).toBe("unknown");
    for (const raw of ["nope", "[]", '{"v":1}', '{"v":1,"ids":[1],"positions":{}}']) {
      expect(readLayout(raw).kind).toBe("broken");
    }
    expect(readLayout('{"v":1,"ids":["a"],"positions":{"a":{"x":"1","y":2}}}').kind).toBe("broken");
  });
});

describe("offsetsFor", () => {
  it("maps outline lines to their offsets", () => {
    const offsets = offsetsFor(OLD, BASE);
    expect([...offsets]).toEqual([
      [1, { x: 10, y: 5 }],
      [2, { x: -4, y: 8 }],
    ]);
  });

  it("is empty for a layout made for another text, or none at all", () => {
    expect(offsetsFor("Plan\n  Read", BASE).size).toBe(0);
    expect(offsetsFor(OLD, "").size).toBe(0);
    expect(offsetsFor(OLD, "garbage").size).toBe(0);
  });
});

describe("setOffset", () => {
  it("gives every line an id the first time a node is moved", () => {
    const layout = read(setOffset(OLD, "", 1, { x: 12, y: -3 }, counter()));
    expect(layout.ids).toEqual(["n1", "n2", "n3", "n4"]);
    expect(layout.positions).toEqual({ n2: { x: 12, y: -3 } });
  });

  it("moves a node again and puts it back with a zero offset", () => {
    const moved = setOffset(OLD, BASE, 1, { x: 20, y: 0 }, counter());
    expect(read(moved).positions.r).toEqual({ x: 20, y: 0 });
    const back = read(setOffset(OLD, moved, 1, { x: 0, y: 0 }, counter()));
    expect(back.positions).toEqual({ w: { x: -4, y: 8 } });
  });

  it("starts again from fresh ids when the stored ones no longer fit the text", () => {
    const layout = read(
      setOffset("a\nb\nc", layoutOf(["x"], { x: { x: 1, y: 1 } }), 2, { x: 5, y: 5 }, counter()),
    );
    expect(layout.ids).toEqual(["n1", "n2", "n3"]);
    expect(layout.positions).toEqual({ n3: { x: 5, y: 5 } });
  });

  it("keeps a node inside a sensible distance", () => {
    const layout = read(setOffset(OLD, "", 0, { x: 1e9, y: -1e9 }, counter()));
    expect(Object.values(layout.positions)[0]).toEqual({ x: 4000, y: -4000 });
  });
});

describe("resetLayout", () => {
  it("clears what was moved, and says so when there is nothing to clear", () => {
    expect(resetLayout(BASE)).toBe("");
    expect(resetLayout("")).toBeNull();
  });
});

describe("ids that repeat", () => {
  it("never loop on a generator that gives the same id every time", () => {
    const layout = read(setOffset("a\nb\nc", "", 1, { x: 5, y: 5 }, () => "same"));
    expect(new Set(layout.ids).size).toBe(3);
  });
});
