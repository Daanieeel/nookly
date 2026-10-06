import type { GateNode, GateOp, Output, Pin, Source } from "./parse";

/// A stretch of a label in one style. `bars` is how many overlines run across it.
export interface Run {
  text: string;
  bars: number;
  italic: boolean;
}

export const FONT_SIZE = 17;

function glyphWidth(char: string): number {
  if (char === " ") return 0.3;
  if (char === "(" || char === ")") return 0.35;
  if ("∧∨⊕".includes(char)) return 0.7;
  if ("mwMW".includes(char)) return 0.8;
  if (/[A-Z]/.test(char)) return 0.68;
  return 0.5;
}

/// The width `text` takes, estimated, as there is no layout to measure when the
/// drawing is built.
export function textWidth(text: string, size = FONT_SIZE): number {
  let width = 0;
  for (const char of text) width += glyphWidth(char);
  return width * size;
}

export const runsWidth = (runs: Run[], size = FONT_SIZE): number =>
  runs.reduce((sum, run) => sum + textWidth(run.text, size), 0);

export const plain = (runs: Run[]): string => runs.map((run) => run.text).join("");

const variable = (name: string): Run[] => [{ text: name, bars: 0, italic: true }];

const negate = (runs: Run[]): Run[] => runs.map((run) => ({ ...run, bars: run.bars + 1 }));

function merge(runs: Run[]): Run[] {
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bars === run.bars && last.italic === run.italic) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

const SYMBOL = { AND: "∧", OR: "∨", XOR: "⊕" } as const;
const BASE = {
  AND: "AND",
  OR: "OR",
  XOR: "XOR",
  NAND: "AND",
  NOR: "OR",
  XNOR: "XOR",
  NOT: "NOT",
} as const satisfies Record<GateOp, "AND" | "OR" | "XOR" | "NOT">;
/// How tightly an operator binds; a negated or plain signal never needs brackets.
const PRECEDENCE = { OR: 1, XOR: 2, AND: 3 } as const;

function pinLabel(pin: Pin, parent: keyof typeof PRECEDENCE): Run[] {
  const runs = sourceLabel(pin.from, parent);
  return pin.negated ? negate(runs) : runs;
}

function sourceLabel(source: Source, parent?: keyof typeof PRECEDENCE): Run[] {
  if (source.kind === "input") return variable(source.name);
  return formula(source, parent);
}

/// The formula a gate computes, written with ∧ ∨ ⊕ and overlines.
export function formula(gate: GateNode, parent?: keyof typeof PRECEDENCE): Run[] {
  const base = BASE[gate.op];
  if (base === "NOT") {
    const [pin] = gate.inputs;
    return pin ? negate(pinLabel(pin, "OR")) : [];
  }
  const negated = base !== gate.op;
  const own = PRECEDENCE[base];
  const runs: Run[] = [];
  gate.inputs.forEach((pin, index) => {
    if (index > 0) runs.push({ text: ` ${SYMBOL[base]} `, bars: 0, italic: false });
    runs.push(...pinLabel(pin, base));
  });
  // A negated gate's bar covers the whole expression, so it needs no brackets of its own.
  const brackets = !negated && parent !== undefined && PRECEDENCE[parent] > own;
  const result = merge(negated ? negate(runs) : runs);
  if (!brackets) return result;
  return [{ text: "(", bars: 0, italic: false }, ...result, { text: ")", bars: 0, italic: false }];
}

/// What is written beside an output: its name, or else the formula it computes.
export function outputLabel(output: Output): Run[] {
  return output.name !== null ? variable(output.name) : merge(sourceLabel(output.source));
}
