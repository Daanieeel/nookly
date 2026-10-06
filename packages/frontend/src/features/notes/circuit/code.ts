import { type Drawing, drawingModel, type Part } from "./drawing";

interface Expression {
  text: string;
  /// Safe to use as an operand as it is, without brackets.
  atomic: boolean;
}

const OPERATORS = {
  AND: "&",
  OR: "|",
  XOR: "^",
  NAND: "NAND",
  NOR: "NOR",
  XNOR: "XNOR",
} as const;

const bracketed = (expression: Expression) =>
  expression.atomic ? expression.text : `(${expression.text})`;

/// The code of a finished drawing, in the circuit block's text format: one line per
/// output, named after it. `null` while the drawing is unfinished, so nothing half
/// drawn ever replaces the code.
export function drawingToCode(drawing: Drawing): string | null {
  if (drawingModel(drawing).problem) return null;
  const byId = new Map(drawing.parts.map((part) => [part.id, part]));

  const operand = (part: Part, pin: number): Expression => {
    const wire = drawing.wires.find((w) => w.to === part.id && w.pin === pin);
    // SAFETY: the drawing has no problem, so every pin reached from an output has a wire.
    const inner = express(byId.get(wire!.from)!);
    return part.negated[pin] ? { text: `!${bracketed(inner)}`, atomic: true } : inner;
  };

  const express = (part: Part): Expression => {
    if (part.kind === "INPUT") return { text: part.label, atomic: true };
    if (part.kind === "OUTPUT") return operand(part, 0);
    const operands = Array.from({ length: part.pins }, (_, pin) => operand(part, pin));
    if (part.kind === "NOT") return { text: `!${bracketed(operands[0]!)}`, atomic: true };
    const joiner = ` ${OPERATORS[part.kind]} `;
    return { text: operands.map(bracketed).join(joiner), atomic: false };
  };

  return drawing.parts
    .filter((part) => part.kind === "OUTPUT")
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((output) => {
      const { text } = express(output);
      return output.label ? `${output.label} = ${text}` : text;
    })
    .join("\n");
}
