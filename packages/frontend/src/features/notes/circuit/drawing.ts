import { z } from "zod";
import { applyGate, type Model } from "./evaluate";
import { textWidth } from "./label";
import type { GateOp } from "./parse";
import { BUBBLE_R, gateSymbol, inputTerminal, outputTerminal, type GateSymbol } from "./symbols";

/// A circuit drawn by hand: parts placed on a canvas and wires between them. It
/// is stored in the block as JSON and knows nothing of the block's code.

export type PartKind = GateOp | "INPUT" | "OUTPUT";

export const GATE_KINDS = [
  "AND",
  "OR",
  "NOT",
  "NAND",
  "NOR",
  "XOR",
  "XNOR",
] as const satisfies readonly GateOp[];

export const GRID = 10;
export const MIN_PINS = 2;
export const MAX_PINS = 6;

export interface Part {
  id: string;
  kind: PartKind;
  /// Top left of the part's box.
  x: number;
  y: number;
  /// The name of an input or output; gates have none.
  label: string;
  /// How many inputs a gate has.
  pins: number;
  /// Which pins carry a bubble.
  negated: boolean[];
}

/// A wire from the output of `from` to input pin `pin` of `to`. A pin takes one wire.
export interface Wire {
  from: string;
  to: string;
  pin: number;
}

export interface Drawing {
  parts: Part[];
  wires: Wire[];
}

export interface Point {
  x: number;
  y: number;
}

export const emptyDrawing = (): Drawing => ({ parts: [], wires: [] });

export const wireKey = (wire: Wire) => `${wire.to}:${wire.pin}`;

const pinsOf = (kind: PartKind) =>
  kind === "NOT" || kind === "OUTPUT" ? 1 : kind === "INPUT" ? 0 : 2;
const snap = (n: number) => Math.max(0, Math.round(n / GRID) * GRID);

export interface Box {
  width: number;
  height: number;
  pinX: number[];
  pinY: number[];
  outX: number;
  outY: number;
  symbol: GateSymbol | null;
}

export function boxOf(part: Part): Box {
  if (part.kind === "INPUT") {
    const box = inputTerminal(textWidth(part.label || "M"));
    return {
      width: box.width,
      height: box.height,
      pinX: [],
      pinY: [],
      outX: box.outX,
      outY: box.height / 2,
      symbol: null,
    };
  }
  if (part.kind === "OUTPUT") {
    const box = outputTerminal(textWidth(part.label || "M"));
    return {
      width: box.width,
      height: box.height,
      pinX: [0],
      pinY: [box.height / 2],
      outX: 0,
      outY: box.height / 2,
      symbol: null,
    };
  }
  const symbol = gateSymbol(part.kind, part.pins);
  return { ...symbol, symbol };
}

export function pinPoint(part: Part, pin: number): Point {
  const box = boxOf(part);
  return {
    x: part.x + (box.pinX[pin] ?? 0) - (part.negated[pin] ? 2 * BUBBLE_R : 0),
    y: part.y + (box.pinY[pin] ?? 0),
  };
}

export function outPoint(part: Part): Point {
  const box = boxOf(part);
  return { x: part.x + box.outX, y: part.y + box.outY };
}

function nextId(drawing: Drawing): string {
  const used = drawing.parts.map((part) => Number(part.id.slice(1))).filter(Number.isFinite);
  return `p${Math.max(0, ...used) + 1}`;
}

function nextLabel(drawing: Drawing, kind: PartKind): string {
  const taken = new Set(drawing.parts.filter((p) => p.kind === kind).map((p) => p.label));
  const names = kind === "INPUT" ? "ABCDEFGHIJKLMNOPQRSTUVWX" : "YZXWVU";
  for (const name of names) if (!taken.has(name)) return name;
  return `${names[0]}${taken.size}`;
}

const COLUMN = { INPUT: 20, gate: 190, OUTPUT: 420 };
const ROW = 70;

/// The first free place in the column a part of this kind belongs in.
function freeSpot(drawing: Drawing, kind: PartKind): Point {
  const x = COLUMN[kind === "INPUT" || kind === "OUTPUT" ? kind : "gate"];
  for (let y = 20; ; y += ROW) {
    const crowded = drawing.parts.some(
      (p) => Math.abs(p.x - x) < 90 && Math.abs(p.y - y) < ROW - 10,
    );
    if (!crowded) return { x, y };
  }
}

export interface Added {
  drawing: Drawing;
  id: string;
}

export function addPart(drawing: Drawing, kind: PartKind): Added {
  const id = nextId(drawing);
  const pins = pinsOf(kind);
  const part: Part = {
    id,
    kind,
    ...freeSpot(drawing, kind),
    label: kind === "INPUT" || kind === "OUTPUT" ? nextLabel(drawing, kind) : "",
    pins,
    negated: Array.from({ length: pins }, () => false),
  };
  return { drawing: { ...drawing, parts: [...drawing.parts, part] }, id };
}

const mapPart = (drawing: Drawing, id: string, change: (part: Part) => Part): Drawing => ({
  ...drawing,
  parts: drawing.parts.map((part) => (part.id === id ? change(part) : part)),
});

export const movePart = (drawing: Drawing, id: string, x: number, y: number): Drawing =>
  mapPart(drawing, id, (part) => ({ ...part, x: snap(x), y: snap(y) }));

export const setLabel = (drawing: Drawing, id: string, label: string): Drawing =>
  mapPart(drawing, id, (part) => ({ ...part, label }));

export function toggleNegated(drawing: Drawing, id: string, pin: number): Drawing {
  return mapPart(drawing, id, (part) =>
    pin < 0 || pin >= part.pins
      ? part
      : { ...part, negated: part.negated.map((on, i) => (i === pin ? !on : on)) },
  );
}

/// Gives a gate `pins` inputs, dropping the wires to the ones that go. An
/// inverter always has one and an input or output none to choose.
export function setPins(drawing: Drawing, id: string, pins: number): Drawing {
  const part = drawing.parts.find((p) => p.id === id);
  const fixed = !part || part.kind === "NOT" || part.kind === "INPUT" || part.kind === "OUTPUT";
  if (fixed || pins < MIN_PINS || pins > MAX_PINS || pins === part.pins) return drawing;
  const resized = mapPart(drawing, id, (p) => ({
    ...p,
    pins,
    negated: Array.from({ length: pins }, (_, i) => p.negated[i] ?? false),
  }));
  return { ...resized, wires: resized.wires.filter((w) => w.to !== id || w.pin < pins) };
}

export function connect(drawing: Drawing, from: string, to: string, pin: number): Drawing {
  const source = drawing.parts.find((p) => p.id === from);
  const target = drawing.parts.find((p) => p.id === to);
  const ok =
    source &&
    target &&
    from !== to &&
    source.kind !== "OUTPUT" &&
    target.kind !== "INPUT" &&
    Number.isInteger(pin) &&
    pin >= 0 &&
    pin < target.pins;
  if (!ok) return drawing;
  const wires = drawing.wires.filter((w) => !(w.to === to && w.pin === pin));
  return { ...drawing, wires: [...wires, { from, to, pin }] };
}

export const removeWire = (drawing: Drawing, key: string): Drawing => ({
  ...drawing,
  wires: drawing.wires.filter((wire) => wireKey(wire) !== key),
});

export const removePart = (drawing: Drawing, id: string): Drawing => ({
  parts: drawing.parts.filter((part) => part.id !== id),
  wires: drawing.wires.filter((wire) => wire.from !== id && wire.to !== id),
});

const partSchema = z.object({
  id: z.string(),
  kind: z.enum([...GATE_KINDS, "INPUT", "OUTPUT"]),
  x: z.number().finite(),
  y: z.number().finite(),
  label: z.string().catch(""),
  pins: z.number().catch(0),
  negated: z.array(z.boolean().catch(false)).catch([]),
});

const wireSchema = z.object({ from: z.string(), to: z.string(), pin: z.number() });

const drawingSchema = z.object({
  parts: z.array(z.unknown()),
  wires: z.array(z.unknown()).catch([]),
});

function readPart(entry: z.infer<typeof partSchema>): Part {
  const wanted = Math.round(entry.pins);
  const pins =
    entry.kind === "INPUT"
      ? 0
      : entry.kind === "NOT" || entry.kind === "OUTPUT"
        ? 1
        : Math.min(MAX_PINS, Math.max(MIN_PINS, wanted));
  return {
    id: entry.id,
    kind: entry.kind,
    x: Math.max(0, entry.x),
    y: Math.max(0, entry.y),
    label: entry.label,
    pins,
    negated: Array.from({ length: pins }, (_, i) => entry.negated[i] === true),
  };
}

/// Reads stored JSON, keeping what makes sense. A drawing is never refused: a
/// part or wire it can't read is dropped and the rest opens as usual.
export function parseDrawing(json: string): Drawing {
  let parsed: z.infer<typeof drawingSchema>;
  try {
    parsed = drawingSchema.parse(JSON.parse(json));
  } catch {
    return emptyDrawing();
  }
  const parts: Part[] = [];
  for (const entry of parsed.parts) {
    const result = partSchema.safeParse(entry);
    if (result.success && !parts.some((p) => p.id === result.data.id)) {
      parts.push(readPart(result.data));
    }
  }
  let drawing: Drawing = { parts, wires: [] };
  for (const entry of parsed.wires) {
    const result = wireSchema.safeParse(entry);
    if (result.success) {
      drawing = connect(drawing, result.data.from, result.data.to, result.data.pin);
    }
  }
  return drawing;
}

export function stringifyDrawing(drawing: Drawing): string {
  return drawing.parts.length === 0 ? "" : JSON.stringify({ v: 1, ...drawing });
}

const KIND_NAME = {
  AND: "An AND",
  OR: "An OR",
  XOR: "An XOR",
  NAND: "A NAND",
  NOR: "A NOR",
  XNOR: "An XNOR",
  NOT: "A NOT",
} satisfies Record<GateOp, string>;

/// The drawing as a function, for checking it against the code. When it isn't
/// finished the model says what is missing instead of an answer.
export function drawingModel(drawing: Drawing): Model {
  const byId = new Map(drawing.parts.map((part) => [part.id, part]));
  const feeding = (part: Part, pin: number) => {
    const wire = drawing.wires.find((w) => w.to === part.id && w.pin === pin);
    return wire ? byId.get(wire.from) : undefined;
  };

  const inputs = [...new Set(drawing.parts.filter((p) => p.kind === "INPUT").map((p) => p.label))];
  const outputs = drawing.parts
    .filter((p) => p.kind === "OUTPUT")
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const problem = (): string | undefined => {
    if (drawing.parts.length === 0) return "Draw a circuit first.";
    if (outputs.length === 0) return "Add an output to your circuit.";
    if (inputs.includes("")) return "Give every input a name.";
    const names = outputs.map((o) => o.label).filter(Boolean);
    const twice = names.find((name, i) => names.indexOf(name) !== i);
    if (twice) return `Two outputs are called "${twice}".`;
    const done = new Set<Part>();
    const walking = new Set<Part>();
    const visit = (part: Part): string | undefined => {
      if (walking.has(part)) return "The wires form a loop.";
      if (done.has(part) || part.kind === "INPUT") return undefined;
      walking.add(part);
      for (let pin = 0; pin < part.pins; pin++) {
        const from = feeding(part, pin);
        if (!from) {
          return part.kind === "OUTPUT"
            ? part.label
              ? `Output "${part.label}" has no wire.`
              : "An output has no wire."
            : `${KIND_NAME[part.kind]} gate has an input with no wire.`;
        }
        const found = visit(from);
        if (found) return found;
      }
      walking.delete(part);
      done.add(part);
      return undefined;
    };
    for (const output of outputs) {
      const found = visit(output);
      if (found) return found;
    }
    return undefined;
  };

  const found = problem();
  return {
    inputs,
    outputs: outputs.map((output) => output.label),
    problem: found,
    evaluate(values) {
      if (found) throw new Error(found);
      const memo = new Map<Part, boolean>();
      const read = (part: Part): boolean => {
        const known = memo.get(part);
        if (known !== undefined) return known;
        let value: boolean;
        if (part.kind === "INPUT") {
          value = part.label === "1" ? true : part.label === "0" ? false : !!values[part.label];
        } else {
          const pins = Array.from({ length: part.pins }, (_, pin) => {
            // SAFETY: `problem` checked that every pin reached from an output has a wire.
            const from = feeding(part, pin) as Part;
            return read(from) !== part.negated[pin];
          });
          value = part.kind === "OUTPUT" ? !!pins[0] : applyGate(part.kind, pins);
        }
        memo.set(part, value);
        return value;
      };
      return outputs.map(read);
    },
  };
}

/// The corners of a wire, which leaves its output to the right, turns, and meets
/// its pin from the left.
export function wirePoints(drawing: Drawing, wire: Wire): Point[] {
  const from = drawing.parts.find((p) => p.id === wire.from);
  const to = drawing.parts.find((p) => p.id === wire.to);
  if (!from || !to) return [];
  const start = outPoint(from);
  const end = pinPoint(to, wire.pin);
  const turn = start.x + Math.max(16, (end.x - start.x) / 2);
  return [start, { x: turn, y: start.y }, { x: turn, y: end.y }, end];
}

export type Hit =
  | { kind: "out"; id: string }
  | { kind: "pin"; id: string; pin: number }
  | { kind: "part"; id: string }
  | { kind: "wire"; key: string }
  | { kind: "none" };

/// How close a pointer must be to a pin to grab it.
export const PIN_HIT = 9;
const WIRE_HIT = 5;

const near = (a: Point, x: number, y: number, radius: number) =>
  Math.hypot(a.x - x, a.y - y) <= radius;

function nearSegment(a: Point, b: Point, x: number, y: number, radius: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length));
  return Math.hypot(a.x + t * dx - x, a.y + t * dy - y) <= radius;
}

/// What is under the point (x, y): a pin first, then a part, then a wire.
export function hitTest(drawing: Drawing, x: number, y: number): Hit {
  const parts = [...drawing.parts].reverse();
  for (const part of parts) {
    if (part.kind !== "OUTPUT" && near(outPoint(part), x, y, PIN_HIT)) {
      return { kind: "out", id: part.id };
    }
    for (let pin = 0; pin < part.pins; pin++) {
      if (near(pinPoint(part, pin), x, y, PIN_HIT)) return { kind: "pin", id: part.id, pin };
    }
  }
  for (const part of parts) {
    const box = boxOf(part);
    if (x >= part.x && x <= part.x + box.width && y >= part.y && y <= part.y + box.height) {
      return { kind: "part", id: part.id };
    }
  }
  for (const wire of drawing.wires) {
    const points = wirePoints(drawing, wire);
    for (let i = 1; i < points.length; i++) {
      if (nearSegment(points[i - 1], points[i], x, y, WIRE_HIT)) {
        return { kind: "wire", key: wireKey(wire) };
      }
    }
  }
  return { kind: "none" };
}

/// The words a person would use for a part: "Input A", "AND gate 2".
export function describePart(drawing: Drawing, part: Part): string {
  if (part.kind === "INPUT") return `Input ${part.label}`.trim();
  if (part.kind === "OUTPUT") return `Output ${part.label}`.trim();
  const same = drawing.parts.filter((p) => p.kind === part.kind);
  return `${part.kind} gate ${same.indexOf(part) + 1}`;
}
