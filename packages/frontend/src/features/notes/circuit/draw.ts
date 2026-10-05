import { FONT_SIZE, runsWidth, textWidth, type Run } from "./label";
import type { Layout, LayoutNode } from "./layout";
import {
  BUBBLE_R,
  LABEL_GAP,
  pinBubbles,
  STROKE,
  STUB,
  TERMINAL_HEIGHT,
  type GateSymbol,
} from "./symbols";

/// What a circuit is drawn with. The static drawing prints these as SVG text and
/// the interactive canvas as React elements, so both look the same.
export type Prim =
  | { t: "path"; d: string }
  | { t: "circle"; cx: number; cy: number; r: number; filled: boolean }
  | {
      t: "text";
      x: number;
      y: number;
      text: string;
      italic: boolean;
      size: number;
      anchor: "start" | "end";
    }
  | { t: "group"; x: number; y: number; children: Prim[] };

export const FONT_FAMILY =
  '"Cambria Math", "STIX Two Math", "Latin Modern Math", "Times New Roman", serif';
const BAR_RISE = 0.95;
const BAR_STEP = 3.5;
const WIRE_LABEL_SIZE = 13;
const DOT_R = 3.5;

/// A label as text with an overline across each stretch that has a bar.
export function labelPrims(
  runs: Run[],
  x: number,
  baseline: number,
  anchor: "start" | "end",
  size = FONT_SIZE,
): Prim[] {
  const prims: Prim[] = [];
  const total = runsWidth(runs, size);
  let at = anchor === "end" ? x - total : x;
  const spans: { start: number; end: number; bars: number }[] = [];
  for (const run of runs) {
    const width = textWidth(run.text, size);
    // SVG collapses the spaces around text, so they only move it.
    const trimmed = run.text.trimStart();
    prims.push({
      t: "text",
      x: at + textWidth(run.text.slice(0, run.text.length - trimmed.length), size),
      y: baseline,
      text: trimmed.trimEnd(),
      italic: run.italic,
      size,
      anchor: "start",
    });
    spans.push({ start: at, end: at + width, bars: run.bars });
    at += width;
  }
  const most = Math.max(0, ...runs.map((run) => run.bars));
  for (let level = 1; level <= most; level++) {
    const y = baseline - size * BAR_RISE - (level - 1) * BAR_STEP;
    let from: number | null = null;
    let to = 0;
    const flush = () => {
      if (from !== null) prims.push({ t: "path", d: `M${round(from)} ${round(y)}H${round(to)}` });
      from = null;
    };
    for (const span of spans) {
      if (span.bars < level) {
        flush();
        continue;
      }
      from ??= span.start;
      to = span.end;
    }
    flush();
  }
  return prims;
}

const round = (n: number) => Math.round(n * 100) / 100;

/// A gate's outline and bubbles, relative to its top left.
export function gatePrims(symbol: GateSymbol, negated: boolean[]): Prim[] {
  const prims: Prim[] = symbol.paths.map((d): Prim => ({ t: "path", d }));
  const bubbles = pinBubbles(symbol, negated);
  if (symbol.outBubble) bubbles.push(symbol.outBubble);
  for (const { cx, cy } of bubbles) {
    prims.push({ t: "circle", cx, cy, r: BUBBLE_R, filled: false });
  }
  return prims;
}

const MID = TERMINAL_HEIGHT / 2;
const BASELINE = MID + FONT_SIZE * 0.3;

/// A circuit input: its name, and the wire that leaves it.
export function inputPrims(label: Run[], width: number): Prim[] {
  return [
    ...labelPrims(label, width - STUB - LABEL_GAP, BASELINE, "end"),
    { t: "path", d: `M${round(width - STUB)} ${MID}H${round(width)}` },
  ];
}

/// A circuit output: the wire that arrives, and its label.
export function outputPrims(label: Run[]): Prim[] {
  return [
    { t: "path", d: `M0 ${MID}H${STUB}` },
    ...labelPrims(label, STUB + LABEL_GAP, BASELINE, "start"),
  ];
}

function nodePrims(node: LayoutNode): Prim[] {
  if (node.kind === "input") return inputPrims(node.label, node.width);
  if (node.kind === "output") return outputPrims(node.label);
  if (node.kind === "gate" && node.symbol) {
    const prims = gatePrims(node.symbol, node.negated);
    const name = node.gate?.name;
    if (name) {
      const text = [{ text: name, bars: 0, italic: true }];
      prims.push(...labelPrims(text, node.outX + 5, node.outY - 6, "start", WIRE_LABEL_SIZE));
    }
    return prims;
  }
  return [];
}

/// Every part of a laid out circuit.
function circuitPrims(layout: Layout): Prim[] {
  const prims: Prim[] = layout.paths.map((d): Prim => ({ t: "path", d }));
  for (const { cx, cy } of layout.dots) {
    prims.push({ t: "circle", cx, cy, r: DOT_R, filled: true });
  }
  for (const node of layout.nodes) {
    const children = nodePrims(node);
    if (children.length) prims.push({ t: "group", x: node.x, y: node.y, children });
  }
  return prims;
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function print(prim: Prim): string {
  switch (prim.t) {
    case "path":
      return `<path d="${prim.d}"/>`;
    case "circle":
      return `<circle cx="${round(prim.cx)}" cy="${round(prim.cy)}" r="${prim.r}"${
        prim.filled ? ' fill="currentColor" stroke="none"' : ""
      }/>`;
    case "text":
      return (
        `<text x="${round(prim.x)}" y="${round(prim.y)}" font-size="${prim.size}"` +
        `${prim.italic ? ' font-style="italic"' : ""}` +
        `${prim.anchor === "end" ? ' text-anchor="end"' : ""} fill="currentColor" stroke="none">` +
        `${escape(prim.text)}</text>`
      );
    case "group":
      return `<g transform="translate(${round(prim.x)} ${round(prim.y)})">${prim.children
        .map(print)
        .join("")}</g>`;
  }
}

/// The circuit as an SVG string, in the text colour of wherever it is shown.
export function drawCircuit(layout: Layout): string {
  const { width, height } = layout;
  const label = `Circuit with ${layout.nodes.filter((n) => n.kind === "gate").length} gates`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" ` +
    `width="${round(width)}" height="${round(height)}" role="img" aria-label="${escape(label)}" ` +
    `style="max-width:100%;height:auto" fill="none" stroke="currentColor" ` +
    `stroke-width="${STROKE}" stroke-linejoin="miter" font-family="${escape(FONT_FAMILY)}">` +
    `${circuitPrims(layout).map(print).join("")}</svg>`
  );
}
