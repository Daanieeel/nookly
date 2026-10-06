import { describe, expect, it } from "vitest";
import { drawCircuit, gatePrims, labelPrims } from "./draw";
import { layoutCircuit } from "./layout";
import { parseCircuit } from "./parse";
import { gateSymbol } from "./symbols";

const svg = (source: string) => drawCircuit(layoutCircuit(parseCircuit(source)));

describe("drawCircuit", () => {
  it("makes one svg that names what it shows", () => {
    const out = svg("Y = A & B");
    expect(out.startsWith("<svg")).toBe(true);
    expect(out).toContain('role="img"');
    expect(out).toContain("aria-label=");
    expect(out).toContain('stroke="currentColor"');
  });

  it("draws the signal names and an output formula", () => {
    const out = svg("A & !B");
    expect(out).toContain(">A</text>");
    expect(out).toContain(">B</text>");
    expect(out).toContain("∧");
  });

  it("draws a bubble on a negated pin and on a NOT gate", () => {
    const bubbles = (source: string) => svg(source).match(/<circle[^>]*r="4.5"/g)?.length ?? 0;
    expect(bubbles("A & B")).toBe(0);
    expect(bubbles("!A & B")).toBe(1);
    expect(bubbles("!(A & B)")).toBe(1);
    expect(bubbles("A NAND !B")).toBe(2);
  });

  it("draws a dot where a signal branches", () => {
    expect(svg("x = A & B\nY = x | C\nZ = !x")).toContain('fill="currentColor"');
  });

  it("escapes what it prints", () => {
    const prims = labelPrims([{ text: "<&>", bars: 0, italic: true }], 0, 0, "start");
    expect(JSON.stringify(prims)).toContain("<&>");
    const out = drawCircuit({ width: 10, height: 10, nodes: [], paths: [], dots: [] });
    expect(out).not.toContain("<&>");
  });

  it("labels a wire between gates with its name", () => {
    expect(svg("x = A & B\nY = x | C\nZ = !x")).toContain(">x</text>");
  });
});

describe("labelPrims", () => {
  it("draws an overline across the barred runs only", () => {
    const prims = labelPrims(
      [
        { text: "A", bars: 1, italic: true },
        { text: " ∧ ", bars: 0, italic: false },
        { text: "B", bars: 0, italic: true },
      ],
      0,
      20,
      "start",
    );
    expect(prims.filter((p) => p.t === "path")).toHaveLength(1);
    expect(prims.filter((p) => p.t === "text")).toHaveLength(3);
  });

  it("stacks a bar for each negation", () => {
    const prims = labelPrims([{ text: "A", bars: 2, italic: true }], 0, 20, "start");
    expect(prims.filter((p) => p.t === "path")).toHaveLength(2);
  });

  it("anchors a label at its end", () => {
    const start = labelPrims([{ text: "AB", bars: 0, italic: true }], 100, 0, "start");
    const end = labelPrims([{ text: "AB", bars: 0, italic: true }], 100, 0, "end");
    const x = (prims: typeof start) => (prims[0]?.t === "text" ? prims[0].x : NaN);
    expect(x(end)).toBeLessThan(x(start));
  });
});

describe("gatePrims", () => {
  it("draws the body, then the bubbles", () => {
    const prims = gatePrims(gateSymbol("NAND", 2), [true, false]);
    expect(prims.filter((p) => p.t === "path")).toHaveLength(1);
    expect(prims.filter((p) => p.t === "circle")).toHaveLength(2);
  });
});
