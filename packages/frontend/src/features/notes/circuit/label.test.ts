import { describe, expect, it } from "vitest";
import { formula, outputLabel, plain, textWidth } from "./label";
import { parseCircuit } from "./parse";

const label = (source: string) => {
  const output = parseCircuit(source).outputs[0];
  if (!output) throw new Error("no output");
  return plain(outputLabel(output));
};

describe("formula labels", () => {
  it("writes the operators like the lecture slides", () => {
    expect(label("A & B")).toBe("A ∧ B");
    expect(label("A | B")).toBe("A ∨ B");
    expect(label("A ^ B")).toBe("A ⊕ B");
  });

  it("puts a bar over a negation", () => {
    const output = parseCircuit("!A").outputs[0];
    if (!output) throw new Error("no output");
    expect(outputLabel(output)).toEqual([{ text: "A", bars: 1, italic: true }]);
  });

  it("bars a negated input inside a formula", () => {
    const output = parseCircuit("!A & B").outputs[0];
    if (!output) throw new Error("no output");
    expect(outputLabel(output)).toEqual([
      { text: "A", bars: 1, italic: true },
      { text: " ∧ ", bars: 0, italic: false },
      { text: "B", bars: 0, italic: true },
    ]);
  });

  it("bars the whole of a NAND", () => {
    const output = parseCircuit("A NAND B").outputs[0];
    if (!output) throw new Error("no output");
    expect(outputLabel(output)).toEqual([
      { text: "A", bars: 1, italic: true },
      { text: " ∧ ", bars: 1, italic: false },
      { text: "B", bars: 1, italic: true },
    ]);
    expect(plain(outputLabel(output))).toBe("A ∧ B");
  });

  it("adds parentheses only where the precedence needs them", () => {
    expect(label("(A | B) & C")).toBe("(A ∨ B) ∧ C");
    expect(label("A | B & C")).toBe("A ∨ B ∧ C");
    expect(label("(A & B) & C")).toBe("A ∧ B ∧ C");
  });

  it("expands a named wire into its formula", () => {
    expect(label("x = A & B\nx | C")).toBe("A ∧ B ∨ C");
  });

  it("labels a named output with its name", () => {
    expect(label("Y = A & B")).toBe("Y");
  });

  it("builds a formula from a gate", () => {
    const gate = parseCircuit("A & B").gates[0];
    if (!gate) throw new Error("no gate");
    expect(plain(formula(gate))).toBe("A ∧ B");
  });
});

describe("textWidth", () => {
  it("grows with the text", () => {
    expect(textWidth("AB")).toBeGreaterThan(textWidth("A"));
    expect(textWidth("")).toBe(0);
  });
});
