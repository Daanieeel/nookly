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

function andPath(height: number): AndOutline {
  const radius = height / 2;
  const width = radius + AND_FLAT;
  const flat = num(width - radius);
  return {
    width,
    path: `M0 0H${flat}A${num(radius)} ${num(radius)} 0 0 1 ${flat} ${num(height)}H0Z`,
  };
}

/// The curve OR and XOR have for a back, as cubic control points.
const BACK = { control: 0.28, near: 0.72, far: 0.28 };

function orPath(height: number, dx: number): string {
  const w = OR_WIDTH;
  const x = (f: number) => num(dx + w * f);
  const y = (f: number) => num(height * f);
  return (
    `M${num(dx)} 0C${x(0.5)} 0 ${x(0.8)} ${y(0.3)} ${x(1)} ${y(0.5)}` +
    `C${x(0.8)} ${y(0.7)} ${x(0.5)} ${y(1)} ${num(dx)} ${num(height)}` +
    `C${x(BACK.control)} ${y(BACK.near)} ${x(BACK.control)} ${y(BACK.far)} ${num(dx)} 0Z`
  );
}

/// XOR's extra curve: the back of an OR, on its own.
function orBack(height: number): string {
  const w = OR_WIDTH;
  return (
    `M0 ${num(height)}C${num(w * BACK.control)} ${num(height * BACK.near)} ` +
    `${num(w * BACK.control)} ${num(height * BACK.far)} 0 0`
  );
}

/// The x of the OR back curve at height `y`, found by bisection since the curve
/// is parametric.
function backX(height: number, y: number): number {
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: 3 * OR_WIDTH * BACK.control * u * t,
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

export function gateSymbol(op: GateOp, pins: number): GateSymbol {
  if (op === "NOT") {
    const bubble = { cx: NOT_WIDTH + BUBBLE_R, cy: NOT_HEIGHT / 2 };
    return {
      width: NOT_WIDTH + 2 * BUBBLE_R,
      height: NOT_HEIGHT,
      pinX: [0],
      pinY: [NOT_HEIGHT / 2],
      outX: NOT_WIDTH + 2 * BUBBLE_R,
      outY: NOT_HEIGHT / 2,
      paths: [`M0 0L${NOT_WIDTH} ${NOT_HEIGHT / 2}L0 ${NOT_HEIGHT}Z`],
      outBubble: bubble,
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
  if (family === "and") {
    const and = andPath(height);
    body = and.width;
    paths = [and.path];
    pinX = pinY.map(() => 0);
  } else {
    const dx = xor ? XOR_GAP : 0;
    body = dx + OR_WIDTH;
    paths = xor ? [orPath(height, dx), orBack(height)] : [orPath(height, 0)];
    pinX = pinY.map((y) => backX(height, y));
  }

  return {
    width: body + (inverted ? 2 * BUBBLE_R : 0),
    height,
    pinX,
    pinY,
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
