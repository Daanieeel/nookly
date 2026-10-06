import { describe, expect, it } from "vitest";
import { drawingToCode } from "./code";
import {
  addPart,
  connect,
  drawingModel,
  emptyDrawing,
  setLabel,
  toggleNegated,
  type Drawing,
  type PartKind,
} from "./drawing";
import { circuitModel, compareModels } from "./evaluate";
import { parseCircuit } from "./parse";

/// Puts parts on a drawing one by one and keeps the ids they got.
class Sketch {
  drawing: Drawing = emptyDrawing();

  add(kind: PartKind, label?: string): string {
    const added = addPart(this.drawing, kind);
    this.drawing = label === undefined ? added.drawing : setLabel(added.drawing, added.id, label);
    return added.id;
  }

  wire(from: string, to: string, pin: number) {
    this.drawing = connect(this.drawing, from, to, pin);
  }
}

/// A half adder: S = A ^ B and C = A & B.
function halfAdder(): Drawing {
  const sketch = new Sketch();
  const a = sketch.add("INPUT", "A");
  const b = sketch.add("INPUT", "B");
  const xor = sketch.add("XOR");
  const and = sketch.add("AND");
  const s = sketch.add("OUTPUT", "S");
  const c = sketch.add("OUTPUT", "C");
  for (const gate of [xor, and]) {
    sketch.wire(a, gate, 0);
    sketch.wire(b, gate, 1);
  }
  sketch.wire(xor, s, 0);
  sketch.wire(and, c, 0);
  return sketch.drawing;
}

describe("drawingToCode", () => {
  it("writes one line per output", () => {
    expect(drawingToCode(halfAdder())).toBe("S = A ^ B\nC = A & B");
  });

  it("writes code that draws the same circuit back", () => {
    const code = drawingToCode(halfAdder());
    const result = compareModels(circuitModel(parseCircuit(code ?? "")), drawingModel(halfAdder()));
    expect(result.ok).toBe(true);
  });

  it("nests gates and negated pins, keeping the meaning", () => {
    const sketch = new Sketch();
    const a = sketch.add("INPUT", "A");
    const b = sketch.add("INPUT", "B");
    const nor = sketch.add("NOR");
    const not = sketch.add("NOT");
    const nand = sketch.add("NAND");
    const y = sketch.add("OUTPUT", "Y");
    sketch.wire(a, nor, 0);
    sketch.wire(b, nor, 1);
    sketch.wire(nor, not, 0);
    sketch.wire(not, nand, 0);
    sketch.wire(a, nand, 1);
    sketch.drawing = toggleNegated(sketch.drawing, nand, 1);
    sketch.wire(nand, y, 0);
    const code = drawingToCode(sketch.drawing);
    expect(code).not.toBeNull();
    const result = compareModels(
      circuitModel(parseCircuit(code ?? "")),
      drawingModel(sketch.drawing),
    );
    expect(result.ok, `${code}\n${result.message}`).toBe(true);
  });

  it("writes a bare expression for an output with no name", () => {
    const sketch = new Sketch();
    const a = sketch.add("INPUT", "A");
    const b = sketch.add("INPUT", "B");
    const or = sketch.add("OR");
    const out = sketch.add("OUTPUT", "");
    sketch.wire(a, or, 0);
    sketch.wire(b, or, 1);
    sketch.wire(or, out, 0);
    expect(drawingToCode(sketch.drawing)).toBe("A | B");
  });

  it("writes nothing for a circuit that is not finished", () => {
    expect(drawingToCode(emptyDrawing())).toBeNull();
    const sketch = new Sketch();
    sketch.add("INPUT", "A");
    sketch.add("AND");
    sketch.add("OUTPUT", "Y");
    expect(drawingToCode(sketch.drawing)).toBeNull();
  });
});
