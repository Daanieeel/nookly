import type { Circuit, GateOp, Pin, Source } from "./parse";

/// A circuit as a function, so the code and a hand drawn circuit can be compared
/// without caring how either is wired.
export interface Model {
  inputs: string[];
  /// One name per output, in order; `""` for an output with none.
  outputs: string[];
  /// What is wrong with the circuit, when it can't be evaluated yet.
  problem?: string;
  /// Throws an `Error` with a readable message when the circuit is incomplete.
  evaluate: (values: Record<string, boolean>) => boolean[];
}

export function applyGate(op: GateOp, values: boolean[]): boolean {
  const some = values.some(Boolean);
  const all = values.every(Boolean);
  const odd = values.filter(Boolean).length % 2 === 1;
  switch (op) {
    case "AND":
      return all;
    case "OR":
      return some;
    case "XOR":
      return odd;
    case "NAND":
      return !all;
    case "NOR":
      return !some;
    case "XNOR":
      return !odd;
    case "NOT":
      return !values[0];
  }
}

export function circuitModel(circuit: Circuit): Model {
  return {
    inputs: circuit.inputs.map((input) => input.name),
    outputs: circuit.outputs.map((output) => output.name ?? ""),
    evaluate(values) {
      const memo = new Map<Source, boolean>();
      const read = (source: Source): boolean => {
        const known = memo.get(source);
        if (known !== undefined) return known;
        let value: boolean;
        if (source.kind === "input") {
          // 0 and 1 are constants rather than signals to set.
          value = source.name === "1" ? true : source.name === "0" ? false : !!values[source.name];
        } else {
          value = applyGate(source.op, source.inputs.map(pin));
        }
        memo.set(source, value);
        return value;
      };
      const pin = (p: Pin) => read(p.from) !== p.negated;
      return circuit.outputs.map((output) => read(output.source));
    },
  };
}

export interface CheckResult {
  ok: boolean;
  message: string;
}

const MAX_INPUTS = 12;

type Pairing = { ok: true; pairs: [number, number][] } | { ok: false; message: string };

/// Pairs each of the code's outputs with one of the circuit's, by name.
function pair(code: Model, drawn: Model): Pairing {
  if (code.outputs.length === 1 && drawn.outputs.length === 1) {
    return { ok: true, pairs: [[0, 0]] };
  }
  const pairs: [number, number][] = [];
  for (const [index, name] of code.outputs.entries()) {
    const at = name === "" ? index : drawn.outputs.indexOf(name);
    if (at < 0 || at >= drawn.outputs.length) {
      const message =
        name === ""
          ? "Your circuit has fewer outputs than the code."
          : `Your circuit has no output named "${name}".`;
      return { ok: false, message };
    }
    pairs.push([index, at]);
  }
  const extra = drawn.outputs.findIndex((_, at) => !pairs.some(([, d]) => d === at));
  if (extra >= 0) {
    const message = `Your circuit has an output "${drawn.outputs[extra]}" the code does not have.`;
    return { ok: false, message };
  }
  return { ok: true, pairs };
}

const bit = (value: boolean) => (value ? "1" : "0");

/// Whether the circuit computes what the code does, row by row of the truth table.
export function compareModels(code: Model, drawn: Model): CheckResult {
  if (drawn.problem) return { ok: false, message: drawn.problem };
  const inputs = [...new Set([...code.inputs, ...drawn.inputs])];
  if (inputs.length > MAX_INPUTS) {
    return { ok: false, message: `Too many inputs to check, ${MAX_INPUTS} at most.` };
  }
  const pairing = pair(code, drawn);
  if (!pairing.ok) return pairing;
  const { pairs } = pairing;
  try {
    for (let row = 0; row < 2 ** inputs.length; row++) {
      // The first input is the most significant bit, so rows read like a truth table.
      const values: Record<string, boolean> = {};
      inputs.forEach((name, i) => {
        values[name] = ((row >> (inputs.length - 1 - i)) & 1) === 1;
      });
      const expected = code.evaluate(values);
      const actual = drawn.evaluate(values);
      for (const [c, d] of pairs) {
        if (expected[c] === actual[d]) continue;
        const given = inputs.map((name) => `${name} = ${bit(values[name] ?? false)}`);
        const where =
          given.length > 1 ? `${given.slice(0, -1).join(", ")} and ${given.at(-1)}` : given[0];
        const name = code.outputs[c] || drawn.outputs[d] || "the output";
        return {
          ok: false,
          message:
            `Not equal. With ${where} the code gives ${name} = ${bit(expected[c] ?? false)} ` +
            `but your circuit gives ${name} = ${bit(actual[d] ?? false)}.`,
        };
      }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  return {
    ok: true,
    message: `Equal. Your circuit matches the code on all ${2 ** inputs.length} input combinations.`,
  };
}
