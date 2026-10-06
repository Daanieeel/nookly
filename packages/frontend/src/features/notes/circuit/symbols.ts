import type { GateOp } from "./parse";

/// The symbols of the lecture slides, drawn as SVG paths. A symbol's origin is the
/// top left of its box; wires meet it at `pinX` and leave it at `outX`.

export const STROKE = 2.5;
export const BUBBLE_R = 4.5;

const MIN_HEIGHT = 48;
const MIN_PIN_GAP = 14;
const AND_FLAT = 36;
const OR_WIDTH = 64;
/// How far XOR's extra curve sits behind OR's back.
const XOR_GAP = 8;
const NOT_WIDTH = 48;
const NOT_HEIGHT = 52;

export interface Point {
  cx: number;
  cy: number;
}

export interface GateSymbol {
  width: number;
  height: number;
  /// Where each input wire ends, on the gate's back.
  pinX: number[];
  pinY: number[];
  /// Where the inside of the gate begins at each pin, for a label there.
  insideX: number[];
  /// The width of the gate's body, without an output bubble.
  body: number;
  /// Where the output wire starts, past the output bubble if there is one.
  outX: number;
  outY: number;
  paths: string[];
  outBubble: Point | null;
}

const round = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => String(round(n));

/// A circle on the back of the gate stands for a negated input.
export function pinBubbles(symbol: GateSymbol, negated: boolean[]): Point[] {
  const bubbles: Point[] = [];
  negated.forEach((on, index) => {
    if (on) bubbles.push({ cx: (symbol.pinX[index] ?? 0) - BUBBLE_R, cy: symbol.pinY[index] ?? 0 });
  });
  return bubbles;
}

function pinsFor(height: number, pins: number): number[] {
  return Array.from({ length: pins }, (_, i) => round((height * (i + 1)) / (pins + 1)));
}

interface AndOutline {
  path: string;
  width: number;
}

function andPath(height: number, widen: number): AndOutline {
  const radius = height / 2;
  const width = radius + AND_FLAT + widen;
  const flat = num(width - radius);
  return {
    width,
    path: `M0 0H${flat}A${num(radius)} ${num(radius)} 0 0 1 ${flat} ${num(height)}H0Z`,
  };
}

/// The curve OR and XOR have for a back, as cubic control points.
const BACK = { control: 0.28, near: 0.72, far: 0.28 };

function orPath(height: number, dx: number, w: number): string {
  const x = (f: number) => num(dx + w * f);
  const y = (f: number) => num(height * f);
  return (
    `M${num(dx)} 0C${x(0.5)} 0 ${x(0.8)} ${y(0.3)} ${x(1)} ${y(0.5)}` +
    `C${x(0.8)} ${y(0.7)} ${x(0.5)} ${y(1)} ${num(dx)} ${num(height)}` +
    `C${x(BACK.control)} ${y(BACK.near)} ${x(BACK.control)} ${y(BACK.far)} ${num(dx)} 0Z`
  );
}

/// XOR's extra curve: the back of an OR, on its own.
function orBack(height: number, w: number): string {
  return (
    `M0 ${num(height)}C${num(w * BACK.control)} ${num(height * BACK.near)} ` +
    `${num(w * BACK.control)} ${num(height * BACK.far)} 0 0`
  );
}

/// The x of the OR back curve at height `y`, found by bisection since the curve
/// is parametric.
function backX(height: number, y: number, w: number): number {
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: 3 * w * BACK.control * u * t,
      y: height * (u ** 3 + 3 * u * u * t * BACK.near + 3 * u * t * t * BACK.far),
    };
  };
  let low = 0;
  let high = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    // y falls from the bottom (t = 0) to the top (t = 1).
    if (at(mid).y > y) low = mid;
    else high = mid;
  }
  return round(at((low + high) / 2).x);
}

/// The symbol of a gate. `widen` stretches its body by that much, to give the labels
/// inside it room.
export function gateSymbol(op: GateOp, pins: number, widen = 0): GateSymbol {
  if (op === "NOT") {
    const body = NOT_WIDTH + widen;
    return {
      width: body + 2 * BUBBLE_R,
      height: NOT_HEIGHT,
      pinX: [0],
      pinY: [NOT_HEIGHT / 2],
      insideX: [0],
      body,
      outX: body + 2 * BUBBLE_R,
      outY: NOT_HEIGHT / 2,
      paths: [`M0 0L${body} ${NOT_HEIGHT / 2}L0 ${NOT_HEIGHT}Z`],
      outBubble: { cx: body + BUBBLE_R, cy: NOT_HEIGHT / 2 },
    };
  }

  const height = Math.max(MIN_HEIGHT, (pins + 1) * MIN_PIN_GAP);
  const pinY = pinsFor(height, pins);
  const inverted = op === "NAND" || op === "NOR" || op === "XNOR";
  const family = op === "AND" || op === "NAND" ? "and" : "or";
  const xor = op === "XOR" || op === "XNOR";

  let body: number;
  let paths: string[];
  let pinX: number[];
  let insideX: number[];
  if (family === "and") {
    const and = andPath(height, widen);
    body = and.width;
    paths = [and.path];
    pinX = pinY.map(() => 0);
    insideX = pinX;
  } else {
    const dx = xor ? XOR_GAP : 0;
    const w = OR_WIDTH + widen;
    body = dx + w;
    paths = xor ? [orPath(height, dx, w), orBack(height, w)] : [orPath(height, 0, w)];
    pinX = pinY.map((y) => backX(height, y, w));
    insideX = pinX.map((x) => x + dx);
  }

  return {
    width: body + (inverted ? 2 * BUBBLE_R : 0),
    height,
    pinX,
    pinY,
    insideX,
    body,
    outX: body + (inverted ? 2 * BUBBLE_R : 0),
    outY: height / 2,
    paths,
    outBubble: inverted ? { cx: body + BUBBLE_R, cy: height / 2 } : null,
  };
}

export const TERMINAL_HEIGHT = 24;
/// The short wire between a terminal's label and the circuit.
export const STUB = 18;
export const LABEL_GAP = 6;

/// The box of a circuit input: its name, then a wire out to the right.
export function inputTerminal(labelWidth: number) {
  const width = labelWidth + LABEL_GAP + STUB;
  return { width, height: TERMINAL_HEIGHT, labelEnd: labelWidth, outX: width };
}

/// The box of a circuit output: a wire in from the left, then its label.
export function outputTerminal(labelWidth: number) {
  return {
    width: STUB + LABEL_GAP + labelWidth,
    height: TERMINAL_HEIGHT,
    labelStart: STUB + LABEL_GAP,
    stubEnd: STUB,
  };
}
