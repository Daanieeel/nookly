import { describe, expect, it } from "vitest";
import { layoutCircuit, type LayoutNode } from "./layout";
import { parseCircuit } from "./parse";
import { gateSymbol } from "./symbols";

const layout = (source: string) => layoutCircuit(parseCircuit(source));
const kinds = (nodes: LayoutNode[], kind: LayoutNode["kind"]) =>
  nodes.filter((node) => node.kind === kind);

describe("layoutCircuit", () => {
  it("puts inputs, gates and outputs in columns from left to right", () => {
    const { nodes } = layout("Y = A & B");
    const [a, b] = kinds(nodes, "input");
    const [gate] = kinds(nodes, "gate");
    const [output] = kinds(nodes, "output");
    expect(a?.x).toBe(b?.x);
    expect(gate && a && gate.x).toBeGreaterThan((a?.x ?? 0) + (a?.width ?? 0));
    expect(output && gate && output.x).toBeGreaterThan((gate?.x ?? 0) + (gate?.width ?? 0));
  });

  it("lines a single gate up with its output", () => {
    const { nodes } = layout("Y = A & B");
    const [gate] = kinds(nodes, "gate");
    const [output] = kinds(nodes, "output");
    expect((gate?.y ?? 0) + (gate?.outY ?? 0)).toBe((output?.y ?? 1) + (output?.outY ?? 0));
  });

  it("never lets two nodes of a column overlap", () => {
    const { nodes } = layout("x = A & B\nY = x | !C ^ D\nZ = !x & (C | D)\nW = A NOR D");
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b || a.col !== b.col) continue;
        const apart = a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("carries a long wire through the columns in between", () => {
    const { nodes } = layout("Y = (A & B) | C");
    expect(kinds(nodes, "wire").length).toBe(1);
    const [gate] = kinds(nodes, "gate");
    const wire = kinds(nodes, "wire")[0];
    expect(wire?.col).toBe(gate?.col);
  });

  it("shares one trunk between the users of a signal", () => {
    const { nodes, dots } = layout("x = A & B\nY = x | C\nZ = !x");
    expect(dots.length).toBeGreaterThan(0);
    expect(
      kinds(nodes, "gate")
        .map((g) => g.gate?.op)
        .sort(),
    ).toEqual(["AND", "NOT", "OR"]);
  });

  it("keeps every wire inside the drawing", () => {
    const { width, height, paths, nodes } = layout("S = A ^ B ^ C\nK = A & B | C & (A ^ B)");
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(width);
      expect(node.y + node.height).toBeLessThanOrEqual(height);
    }
    for (const d of paths) {
      const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
      expect(numbers.every((n) => n >= 0 && n <= Math.max(width, height))).toBe(true);
    }
  });

  it("marks negated pins so the wire stops at the bubble", () => {
    const { nodes } = layout("!A & B");
    const [gate] = kinds(nodes, "gate");
    expect(gate?.negated).toEqual([true, false]);
  });

  it("is the same every time", () => {
    const source = "x = A & B\nY = x | !C\nZ = !x";
    expect(layout(source)).toEqual(layout(source));
  });

  it("lays out circuits that are only a wire", () => {
    const { nodes } = layout("Y = A");
    expect(nodes.map((n) => n.kind).sort()).toEqual(["input", "output"]);
  });

  describe("gate tags", () => {
    const gates = (source: string) => kinds(layout(source).nodes, "gate");

    it("numbers every gate G1, G2, ... in the order the code builds them", () => {
      expect(gates("Y = (A & B) | C").map((gate) => gate.tag)).toEqual(["G1", "G2"]);
      expect(gates("x = A & B\nY = x | !C ^ D").map((gate) => gate.tag)).toEqual([
        "G1",
        "G2",
        "G3",
      ]);
    });

    it("labels each input pin with the signal or gate that feeds it", () => {
      const [and, or] = gates("Y = (A & B) | C");
      expect(and?.pinTags).toEqual(["A", "B"]);
      expect(or?.pinTags).toEqual(["G1", "C"]);
    });

    it("labels the pin of a NOT gate and of a negated input with its source", () => {
      const [and, inverter] = gates("Y = !(A & B)");
      expect(and?.pinTags).toEqual(["A", "B"]);
      expect(inverter?.pinTags).toEqual(["G1"]);
      expect(gates("Y = !A & B")[0]?.pinTags).toEqual(["A", "B"]);
    });

    it("keeps the standard symbol when the labels fit and widens it when they do not", () => {
      const width = (source: string) => kinds(layout(source).nodes, "gate")[0]?.width ?? 0;
      expect(width("Y = A & B")).toBe(gateSymbol("AND", 2).width);
      expect(width("Y = LongSignalName & AnotherLongName")).toBeGreaterThan(
        gateSymbol("AND", 2).width,
      );
    });
  });
});
