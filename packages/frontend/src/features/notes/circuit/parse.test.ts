import { describe, expect, it } from "vitest";
import { CircuitError, parseCircuit, type GateNode } from "./parse";

const gateOf = (source: string): GateNode => {
  const circuit = parseCircuit(source);
  const gate = circuit.outputs[0]?.source;
  if (gate?.kind !== "gate") throw new Error("expected a gate");
  return gate;
};

const names = (gate: GateNode) =>
  gate.inputs.map((pin) => (pin.from.kind === "input" ? pin.from.name : pin.from.op));

describe("parseCircuit", () => {
  it("reads one gate with its inputs and output", () => {
    const circuit = parseCircuit("Y = A & B");
    expect(circuit.inputs.map((i) => i.name)).toEqual(["A", "B"]);
    expect(circuit.gates.map((g) => g.op)).toEqual(["AND"]);
    expect(circuit.outputs.map((o) => o.name)).toEqual(["Y"]);
  });

  it("gives a bare expression an output with no name", () => {
    expect(parseCircuit("A | B").outputs.map((o) => o.name)).toEqual([null]);
  });

  it("reads the symbols and the keywords alike", () => {
    for (const source of ["A & B", "A ∧ B", "A AND B", "a and b", "A && B"]) {
      expect(gateOf(source).op).toBe("AND");
    }
    for (const source of ["A | B", "A ∨ B", "A OR B"]) expect(gateOf(source).op).toBe("OR");
    for (const source of ["A ^ B", "A ⊕ B", "A XOR B"]) expect(gateOf(source).op).toBe("XOR");
    expect(gateOf("A NAND B").op).toBe("NAND");
    expect(gateOf("A NOR B").op).toBe("NOR");
    expect(gateOf("A XNOR B").op).toBe("XNOR");
  });

  it("joins a chain of one operator into one gate", () => {
    const gate = gateOf("A & B & C");
    expect(gate.op).toBe("AND");
    expect(names(gate)).toEqual(["A", "B", "C"]);
  });

  it("keeps parentheses as separate gates", () => {
    const gate = gateOf("(A & B) & C");
    expect(names(gate)).toEqual(["AND", "C"]);
    expect(names(gateOf("A & (B & C)"))).toEqual(["A", "AND"]);
  });

  it("binds AND tighter than XOR tighter than OR", () => {
    expect(names(gateOf("A | B & C"))).toEqual(["A", "AND"]);
    expect(names(gateOf("A | B ^ C"))).toEqual(["A", "XOR"]);
    expect(names(gateOf("A ^ B & C"))).toEqual(["A", "AND"]);
    expect(names(gateOf("(A | B) & C"))).toEqual(["OR", "C"]);
  });

  it("draws a negated input as a bubble, not a gate", () => {
    const circuit = parseCircuit("!A & B");
    expect(circuit.gates.map((g) => g.op)).toEqual(["AND"]);
    expect(circuit.gates[0]?.inputs.map((p) => p.negated)).toEqual([true, false]);
  });

  it("uses a NOT gate for anything but a single input", () => {
    expect(gateOf("!A").op).toBe("NOT");
    const gate = gateOf("!(A & B)");
    expect(gate.op).toBe("NOT");
    expect(names(gate)).toEqual(["AND"]);
  });

  it("cancels a double negation of an input", () => {
    const circuit = parseCircuit("!!A & B");
    expect(circuit.gates[0]?.inputs.map((p) => p.negated)).toEqual([false, false]);
  });

  it("accepts every spelling of NOT", () => {
    for (const source of ["!A", "~A", "¬A", "NOT A"]) expect(gateOf(source).op).toBe("NOT");
  });

  it("shares a named wire between its users", () => {
    const circuit = parseCircuit("x = A & B\nY = x | !C\nZ = !x");
    expect(circuit.outputs.map((o) => o.name)).toEqual(["Y", "Z"]);
    expect(circuit.gates.map((g) => g.op)).toEqual(["AND", "OR", "NOT"]);
    const [and, or, not] = circuit.gates;
    expect(and?.name).toBe("x");
    expect(or?.inputs[0]?.from).toBe(and);
    expect(not?.inputs[0]?.from).toBe(and);
    expect(circuit.inputs.map((i) => i.name)).toEqual(["A", "B", "C"]);
  });

  it("does not care which order the lines come in", () => {
    const circuit = parseCircuit("Y = x | C\nx = A & B");
    expect(circuit.outputs.map((o) => o.name)).toEqual(["Y"]);
    expect(circuit.gates.map((g) => g.op).sort()).toEqual(["AND", "OR"]);
  });

  it("lets a name stand for an input", () => {
    const circuit = parseCircuit("Y = A");
    expect(circuit.gates).toEqual([]);
    expect(circuit.outputs[0]?.source.kind).toBe("input");
  });

  it("ignores blank lines and comments", () => {
    const circuit = parseCircuit("# half adder\n\nS = A ^ B  // sum\nC = A & B");
    expect(circuit.outputs.map((o) => o.name)).toEqual(["S", "C"]);
  });

  it("reads 0 and 1 as constant inputs", () => {
    expect(parseCircuit("A & 1").inputs.map((i) => i.name)).toEqual(["A", "1"]);
  });

  it("shares one NOT gate between uses of the same negated wire", () => {
    const circuit = parseCircuit("x = A & B\nY = !x\nZ = !x");
    expect(circuit.gates.filter((g) => g.op === "NOT")).toHaveLength(1);
  });
});

describe("parseCircuit errors", () => {
  const message = (source: string) => {
    try {
      parseCircuit(source);
    } catch (error) {
      if (error instanceof CircuitError) return error.message;
      throw error;
    }
    throw new Error("expected an error");
  };

  it("names the line", () => {
    expect(message("Y = A & B\nZ = A &")).toMatch(/^Line 2:/);
  });

  it("says what it found instead", () => {
    expect(message("Y = A & & B")).toContain("&");
    expect(message("Y = (A & B")).toContain(")");
    expect(message("Y = A $ B")).toContain("$");
    expect(message("Y = A B")).toContain("B");
  });

  it("refuses a name defined twice", () => {
    expect(message("x = A\nx = B")).toBe('Line 2: "x" is defined twice');
  });

  it("refuses a loop", () => {
    expect(message("x = y & A\ny = !x")).toBe("Line 1: loop x → y → x");
    expect(message("x = x & A")).toBe("Line 1: loop x → x");
  });

  it("refuses an empty circuit", () => {
    expect(message("  \n# nothing\n")).toBe("Nothing to draw yet");
  });
});
