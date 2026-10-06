import { describe, expect, it } from "vitest";
import { applyGate, circuitModel, compareModels, type Model } from "./evaluate";
import { parseCircuit } from "./parse";

const model = (source: string) => circuitModel(parseCircuit(source));

describe("applyGate", () => {
  it("computes every gate", () => {
    expect(applyGate("AND", [true, true, false])).toBe(false);
    expect(applyGate("OR", [false, false, true])).toBe(true);
    expect(applyGate("XOR", [true, true, true])).toBe(true);
    expect(applyGate("XOR", [true, true])).toBe(false);
    expect(applyGate("NAND", [true, true])).toBe(false);
    expect(applyGate("NOR", [false, false])).toBe(true);
    expect(applyGate("XNOR", [true, false])).toBe(false);
    expect(applyGate("NOT", [false])).toBe(true);
  });
});

describe("circuitModel", () => {
  it("lists the inputs and outputs", () => {
    const m = model("S = A ^ B\nC = A & B");
    expect(m.inputs).toEqual(["A", "B"]);
    expect(m.outputs).toEqual(["S", "C"]);
  });

  it("evaluates with bubbles and inverters", () => {
    const m = model("!A & B");
    expect(m.evaluate({ A: false, B: true })).toEqual([true]);
    expect(m.evaluate({ A: true, B: true })).toEqual([false]);
    const n = model("!(A | B)");
    expect(n.evaluate({ A: false, B: false })).toEqual([true]);
  });

  it("treats 0 and 1 as constants", () => {
    expect(model("A & 1").evaluate({ A: true })).toEqual([true]);
    expect(model("A | 0").evaluate({ A: false })).toEqual([false]);
  });
});

describe("compareModels", () => {
  it("accepts a different circuit for the same function", () => {
    const result = compareModels(model("Y = A & B"), model("Y = !(!A | !B)"));
    expect(result.ok).toBe(true);
  });

  it("reports the first row that differs", () => {
    const result = compareModels(model("Y = A & B"), model("Y = A | B"));
    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      "Not equal. With A = 0 and B = 1 the code gives Y = 0 but your circuit gives Y = 1.",
    );
  });

  it("pairs a lone output whatever it is called", () => {
    expect(compareModels(model("A | B"), model("Q = B | A")).ok).toBe(true);
  });

  it("pairs outputs by name", () => {
    const code = model("S = A ^ B\nC = A & B");
    const drawn = model("C = B & A\nS = A ^ B");
    expect(compareModels(code, drawn).ok).toBe(true);
  });

  it("says when an output is missing or extra", () => {
    const code = model("S = A ^ B\nC = A & B");
    expect(compareModels(code, model("S = A ^ B")).message).toBe(
      'Your circuit has no output named "C".',
    );
    expect(compareModels(model("S = A ^ B"), code).message).toBe(
      'Your circuit has an output "C" the code does not have.',
    );
  });

  it("ignores an input one side never uses", () => {
    expect(compareModels(model("Y = A | (A & B)"), model("Y = A")).ok).toBe(true);
  });

  it("refuses too many inputs", () => {
    const names = Array.from({ length: 13 }, (_, i) => `x${i}`);
    expect(compareModels(model(names.join(" & ")), model(names.join(" & "))).message).toBe(
      "Too many inputs to check, 12 at most.",
    );
  });

  it("passes on what evaluate throws", () => {
    const broken: Model = {
      inputs: ["A"],
      outputs: ["Y"],
      evaluate: () => {
        throw new Error("Nothing is wired");
      },
    };
    expect(compareModels(model("Y = A"), broken).message).toBe("Nothing is wired");
  });
});
