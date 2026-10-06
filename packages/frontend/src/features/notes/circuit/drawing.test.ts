import { describe, expect, it } from "vitest";
import { circuitModel, compareModels } from "./evaluate";
import {
  addPart,
  boxOf,
  connect,
  drawingModel,
  describePart,
  emptyDrawing,
  hitTest,
  movePart,
  outPoint,
  parseDrawing,
  pinPoint,
  removePart,
  removeWire,
  setLabel,
  setPins,
  stringifyDrawing,
  toggleNegated,
  type Drawing,
  type PartKind,
  wirePoints,
} from "./drawing";
import { parseCircuit } from "./parse";
import { BUBBLE_R } from "./symbols";

/// Builds a drawing from a list of parts and wires, by the ids `add` returns.
interface Built {
  drawing: Drawing;
  ids: string[];
}

function build(kinds: PartKind[]): Built {
  let drawing = emptyDrawing();
  const ids: string[] = [];
  for (const kind of kinds) {
    const added = addPart(drawing, kind);
    drawing = added.drawing;
    ids.push(added.id);
  }
  return { drawing, ids };
}

const at = (ids: string[], i: number) => ids[i] ?? "";

describe("addPart", () => {
  it("names inputs and outputs for you", () => {
    const { drawing } = build(["INPUT", "INPUT", "OUTPUT", "OUTPUT"]);
    expect(drawing.parts.map((p) => p.label)).toEqual(["A", "B", "Y", "Z"]);
  });

  it("gives gates two pins, and an inverter one", () => {
    const { drawing } = build(["AND", "NOT"]);
    expect(drawing.parts.map((p) => p.pins)).toEqual([2, 1]);
    expect(drawing.parts.map((p) => p.negated)).toEqual([[false, false], [false]]);
  });

  it("never drops a part on top of another", () => {
    const { drawing } = build(["AND", "AND", "AND", "OR", "OR"]);
    const spots = new Set(drawing.parts.map((p) => `${p.x},${p.y}`));
    expect(spots.size).toBe(5);
  });

  it("gives every part its own id", () => {
    const { ids } = build(["AND", "AND", "INPUT"]);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("editing", () => {
  it("snaps a moved part to the grid and keeps it on the canvas", () => {
    const { drawing, ids } = build(["AND"]);
    const moved = movePart(drawing, at(ids, 0), 123, -40);
    expect(moved.parts[0]).toMatchObject({ x: 120, y: 0 });
  });

  it("joins an output to an input pin and replaces what was there", () => {
    const { drawing, ids } = build(["INPUT", "INPUT", "AND"]);
    let d = connect(drawing, at(ids, 0), at(ids, 2), 0);
    d = connect(d, at(ids, 1), at(ids, 2), 0);
    expect(d.wires).toEqual([{ from: at(ids, 1), to: at(ids, 2), pin: 0 }]);
  });

  it("lets one output feed several pins", () => {
    const { drawing, ids } = build(["INPUT", "AND"]);
    let d = connect(drawing, at(ids, 0), at(ids, 1), 0);
    d = connect(d, at(ids, 0), at(ids, 1), 1);
    expect(d.wires).toHaveLength(2);
  });

  it("refuses wires that go nowhere", () => {
    const { drawing, ids } = build(["INPUT", "AND", "OUTPUT"]);
    expect(connect(drawing, at(ids, 2), at(ids, 1), 0)).toBe(drawing);
    expect(connect(drawing, at(ids, 0), at(ids, 0), 0)).toBe(drawing);
    expect(connect(drawing, at(ids, 1), at(ids, 0), 0)).toBe(drawing);
    expect(connect(drawing, at(ids, 0), at(ids, 1), 5)).toBe(drawing);
    expect(connect(drawing, at(ids, 0), "missing", 0)).toBe(drawing);
  });

  it("removes a part with its wires", () => {
    const { drawing, ids } = build(["INPUT", "NOT", "OUTPUT"]);
    let d = connect(drawing, at(ids, 0), at(ids, 1), 0);
    d = connect(d, at(ids, 1), at(ids, 2), 0);
    d = removePart(d, at(ids, 1));
    expect(d.parts).toHaveLength(2);
    expect(d.wires).toEqual([]);
  });

  it("removes one wire", () => {
    const { drawing, ids } = build(["INPUT", "NOT"]);
    const d = connect(drawing, at(ids, 0), at(ids, 1), 0);
    expect(removeWire(d, `${at(ids, 1)}:0`).wires).toEqual([]);
  });

  it("changes the number of pins and drops wires to pins that are gone", () => {
    const { drawing, ids } = build(["INPUT", "AND"]);
    let d = setPins(drawing, at(ids, 1), 3);
    d = connect(d, at(ids, 0), at(ids, 1), 2);
    expect(d.parts[1]?.negated).toEqual([false, false, false]);
    d = setPins(d, at(ids, 1), 2);
    expect(d.wires).toEqual([]);
    expect(d.parts[1]?.pins).toBe(2);
    expect(setPins(d, at(ids, 1), 1)).toBe(d);
    expect(setPins(d, at(ids, 1), 7)).toBe(d);
  });

  it("keeps an inverter at one pin", () => {
    const { drawing, ids } = build(["NOT"]);
    expect(setPins(drawing, at(ids, 0), 2)).toBe(drawing);
  });

  it("puts a bubble on a pin, and takes it off again", () => {
    const { drawing, ids } = build(["AND"]);
    const on = toggleNegated(drawing, at(ids, 0), 1);
    expect(on.parts[0]?.negated).toEqual([false, true]);
    expect(toggleNegated(on, at(ids, 0), 1).parts[0]?.negated).toEqual([false, false]);
  });

  it("renames a part", () => {
    const { drawing, ids } = build(["INPUT"]);
    expect(setLabel(drawing, at(ids, 0), "Cin").parts[0]?.label).toBe("Cin");
  });
});

describe("geometry", () => {
  it("ends a wire at the bubble of a negated pin", () => {
    const { drawing, ids } = build(["AND"]);
    const part = drawing.parts[0];
    const plain = part && pinPoint(part, 0);
    const negated = toggleNegated(drawing, at(ids, 0), 0).parts[0];
    const bubbled = negated && pinPoint(negated, 0);
    expect((plain?.x ?? 0) - (bubbled?.x ?? 0)).toBe(2 * BUBBLE_R);
    expect(plain?.y).toBe(bubbled?.y);
  });

  it("starts a wire at the output of a gate", () => {
    const { drawing } = build(["AND"]);
    const part = drawing.parts[0];
    const box = part && boxOf(part);
    expect(part && outPoint(part)).toEqual({
      x: (part?.x ?? 0) + (box?.outX ?? 0),
      y: (part?.y ?? 0) + (box?.outY ?? 0),
    });
  });

  it("grows an input with its name", () => {
    const { drawing, ids } = build(["INPUT"]);
    const short = drawing.parts[0] && boxOf(drawing.parts[0]).width;
    const long = setLabel(drawing, at(ids, 0), "Carry").parts[0];
    expect(long && boxOf(long).width).toBeGreaterThan(short ?? 0);
  });
});

describe("storage", () => {
  it("round trips a drawing", () => {
    const { drawing, ids } = build(["INPUT", "NOT", "OUTPUT"]);
    const d = connect(connect(drawing, at(ids, 0), at(ids, 1), 0), at(ids, 1), at(ids, 2), 0);
    expect(parseDrawing(stringifyDrawing(d))).toEqual(d);
  });

  it("stores an empty drawing as nothing", () => {
    expect(stringifyDrawing(emptyDrawing())).toBe("");
    expect(parseDrawing("")).toEqual(emptyDrawing());
  });

  it("reads garbage as an empty drawing", () => {
    for (const text of ["{", "[]", "null", '"x"', '{"parts":3}']) {
      expect(parseDrawing(text)).toEqual(emptyDrawing());
    }
  });

  it("drops what it cannot make sense of and keeps the rest", () => {
    const text = JSON.stringify({
      v: 1,
      parts: [
        { id: "a", kind: "INPUT", x: 0, y: 0, label: "A", pins: 0, negated: [] },
        { id: "b", kind: "AND", x: 50, y: 0, label: "", pins: 2, negated: [true] },
        { id: "c", kind: "BOGUS", x: 0, y: 0 },
        { id: "a", kind: "OUTPUT", x: 0, y: 0, label: "dup", pins: 1, negated: [false] },
        { kind: "AND" },
      ],
      wires: [
        { from: "a", to: "b", pin: 0 },
        { from: "a", to: "b", pin: 9 },
        { from: "a", to: "gone", pin: 0 },
        { from: "b", to: "a", pin: 0 },
      ],
    });
    const d = parseDrawing(text);
    expect(d.parts.map((p) => p.id)).toEqual(["a", "b"]);
    expect(d.parts[1]?.negated).toEqual([true, false]);
    expect(d.wires).toEqual([{ from: "a", to: "b", pin: 0 }]);
  });
});

describe("drawingModel", () => {
  function halfAdder(): Drawing {
    const { drawing, ids } = build(["INPUT", "INPUT", "XOR", "AND", "OUTPUT", "OUTPUT"]);
    let d = drawing;
    d = setLabel(d, at(ids, 4), "S");
    d = setLabel(d, at(ids, 5), "C");
    for (const gate of [2, 3]) {
      d = connect(d, at(ids, 0), at(ids, gate), 0);
      d = connect(d, at(ids, 1), at(ids, gate), 1);
    }
    d = connect(d, at(ids, 2), at(ids, 4), 0);
    d = connect(d, at(ids, 3), at(ids, 5), 0);
    return d;
  }

  it("matches the code it was drawn from", () => {
    const code = circuitModel(parseCircuit("S = A ^ B\nC = A & B"));
    expect(compareModels(code, drawingModel(halfAdder())).ok).toBe(true);
  });

  it("notices a wrong gate", () => {
    const code = circuitModel(parseCircuit("S = A ^ B\nC = A | B"));
    const result = compareModels(code, drawingModel(halfAdder()));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("C = ");
  });

  it("counts a bubble", () => {
    const { drawing, ids } = build(["INPUT", "INPUT", "AND", "OUTPUT"]);
    let d = connect(connect(drawing, at(ids, 0), at(ids, 2), 0), at(ids, 1), at(ids, 2), 1);
    d = connect(d, at(ids, 2), at(ids, 3), 0);
    d = toggleNegated(d, at(ids, 2), 0);
    expect(compareModels(circuitModel(parseCircuit("!A & B")), drawingModel(d)).ok).toBe(true);
  });

  const problem = (d: Drawing) =>
    compareModels(circuitModel(parseCircuit("Y = A")), drawingModel(d)).message;

  it("says what is missing", () => {
    expect(problem(emptyDrawing())).toBe("Draw a circuit first.");
    expect(problem(build(["INPUT"]).drawing)).toBe("Add an output to your circuit.");
    const open = build(["INPUT", "AND", "OUTPUT"]);
    expect(problem(open.drawing)).toBe('Output "Y" has no wire.');
    const wired = connect(open.drawing, at(open.ids, 1), at(open.ids, 2), 0);
    expect(problem(wired)).toBe("An AND gate has an input with no wire.");
    expect(problem(setLabel(build(["INPUT", "OUTPUT"]).drawing, "p1", ""))).toBe(
      "Give every input a name.",
    );
  });

  it("notices a loop", () => {
    const { drawing, ids } = build(["NOT", "NOT", "OUTPUT"]);
    let d = connect(drawing, at(ids, 0), at(ids, 1), 0);
    d = connect(d, at(ids, 1), at(ids, 0), 0);
    d = connect(d, at(ids, 0), at(ids, 2), 0);
    expect(problem(d)).toBe("The wires form a loop.");
  });

  it("refuses two outputs with one name", () => {
    const { drawing, ids } = build(["INPUT", "OUTPUT", "OUTPUT"]);
    let d = setLabel(drawing, at(ids, 2), "Y");
    d = connect(connect(d, at(ids, 0), at(ids, 1), 0), at(ids, 0), at(ids, 2), 0);
    expect(problem(d)).toBe('Two outputs are called "Y".');
  });
});

describe("hitTest", () => {
  function wired() {
    const { drawing, ids } = build(["INPUT", "NOT", "OUTPUT"]);
    const d = connect(connect(drawing, at(ids, 0), at(ids, 1), 0), at(ids, 1), at(ids, 2), 0);
    return { d, ids };
  }

  it("finds the output pin of a part", () => {
    const { d, ids } = wired();
    const input = d.parts[0];
    const out = input && outPoint(input);
    expect(hitTest(d, out?.x ?? 0, out?.y ?? 0)).toEqual({ kind: "out", id: at(ids, 0) });
  });

  it("finds an input pin", () => {
    const { d, ids } = wired();
    const not = d.parts[1];
    const pin = not && pinPoint(not, 0);
    expect(hitTest(d, pin?.x ?? 0, pin?.y ?? 0)).toEqual({ kind: "pin", id: at(ids, 1), pin: 0 });
  });

  it("finds a part by its body", () => {
    const { d, ids } = wired();
    const not = d.parts[1];
    expect(hitTest(d, (not?.x ?? 0) + 20, (not?.y ?? 0) + 10)).toEqual({
      kind: "part",
      id: at(ids, 1),
    });
  });

  it("finds a wire between parts", () => {
    const { d, ids } = wired();
    const wire = d.wires[0];
    const points = wire ? wirePoints(d, wire) : [];
    const [a, b] = points;
    const x = ((a?.x ?? 0) + (b?.x ?? 0)) / 2;
    expect(hitTest(d, x, a?.y ?? 0)).toEqual({ kind: "wire", key: `${at(ids, 1)}:0` });
  });

  it("finds nothing in empty space", () => {
    const { d } = wired();
    expect(hitTest(d, 900, 900)).toEqual({ kind: "none" });
  });
});

describe("describePart", () => {
  it("numbers gates of one kind", () => {
    const { drawing } = build(["INPUT", "AND", "AND", "OUTPUT"]);
    expect(drawing.parts.map((p) => describePart(drawing, p))).toEqual([
      "Input A",
      "AND gate 1",
      "AND gate 2",
      "Output Y",
    ]);
  });
});
