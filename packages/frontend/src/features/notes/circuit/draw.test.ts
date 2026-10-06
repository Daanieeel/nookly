import { describe, expect, it } from "vitest";
import { BAR_STROKE, drawCircuit, gateLabelPrims, gatePrims, labelPrims } from "./draw";
import { textWidth } from "./label";
import { layoutCircuit } from "./layout";
import { parseCircuit } from "./parse";
import { gateSymbol, STROKE } from "./symbols";

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

  it("writes each gate's tag on it and on the pins it feeds", () => {
    const out = svg("Y = (A & B) | C");
    expect(out.match(/>G1<\/text>/g)?.length).toBe(2);
    expect(out.match(/>G2<\/text>/g)?.length).toBe(1);
    // A and B each as an input and as the label of the pin they feed.
    expect(out.match(/>A<\/text>/g)?.length).toBe(2);
    expect(out.match(/>C<\/text>/g)?.length).toBe(2);
  });

  it.each([
    "Y = A & B",
    "Y = A | B | C | D",
    "Y = A ^ B",
    "Y = !(A NOR B)",
    "Y = A NAND B",
    "Y = A XNOR LongSignalName",
    "x = A & B\nY = !x | (x ^ C)",
    "Y = !A",
  ])("keeps every label of a gate inside it: %s", (source) => {
    const { nodes } = layoutCircuit(parseCircuit(source));
    for (const node of nodes.filter((n) => n.kind === "gate")) {
      const texts = gateLabelPrims(node).filter((prim) => prim.t === "text");
      expect(texts.length).toBe(node.pinTags.length + 1);
      for (const text of texts) {
        expect(text.x).toBeGreaterThan(0);
        expect(text.x + textWidth(text.text, text.size)).toBeLessThan(node.width);
        // Text sits on its baseline, so its top is a size above it.
        expect(text.y - text.size * 0.8).toBeGreaterThanOrEqual(0);
        expect(text.y).toBeLessThanOrEqual(node.height);
      }
    }
  });

  it("puts a pin's label beside its pin, and the tag after the labels", () => {
    const [gate] = layoutCircuit(parseCircuit("Y = A & B")).nodes.filter((n) => n.kind === "gate");
    const texts = gateLabelPrims(gate!).filter((prim) => prim.t === "text");
    const [a, b, tag] = texts;
    expect(a?.text).toBe("A");
    expect(b?.text).toBe("B");
    expect(tag?.text).toBe("G1");
    expect(a?.y).toBeLessThan(b?.y ?? 0);
    expect(tag?.x).toBeGreaterThan(a?.x ?? 0);
  });

  it("draws the label of a negated pin with a bar over it, and only that one", () => {
    const bars = (source: string) => {
      const [gate] = layoutCircuit(parseCircuit(source)).nodes.filter((n) => n.kind === "gate");
      return gateLabelPrims(gate!).filter((prim) => prim.t === "path");
    };
    expect(bars("Y = A & B")).toHaveLength(0);
    // The bar is over C, which is the first pin; B and the tag stay plain.
    expect(bars("Y = !C & B")).toHaveLength(1);
    expect(bars("Y = !C & !B")).toHaveLength(2);
    expect(bars("Y = !(A & B) | C")).toHaveLength(0);
    // The gate's own symbol keeps its bubble for the negation.
    expect(svg("Y = !C & B").match(/<circle[^>]*r="4.5"/g)).toHaveLength(1);
  });

  it("puts the bar over the label's own text", () => {
    const [gate] = layoutCircuit(parseCircuit("Y = !C & B")).nodes.filter((n) => n.kind === "gate");
    const prims = gateLabelPrims(gate!);
    const c = prims.find((prim) => prim.t === "text" && prim.text === "C");
    const bar = prims.find((prim) => prim.t === "path");
    expect(
      c?.t === "text" && bar?.t === "path" && bar.d.startsWith(`M${Math.round(c.x * 100) / 100} `),
    ).toBe(true);
  });

  it("draws an overline about a third thinner than the wires and gate outlines", () => {
    const out = svg("Y = !C & B");
    // One bar, over the pin label; the wires and outlines keep the svg's width.
    expect(out.match(/<path d="M[^"]*" stroke-width="1.6"\/>/g)).toHaveLength(1);
    expect(out).toContain(`stroke-width="${STROKE}"`);
    expect(BAR_STROKE).toBeCloseTo(STROKE * 0.64);
  });

  it("gives an overline in an output formula the same thinner bar", () => {
    const bars = svg("!A & B").match(/stroke-width="1.6"/g) ?? [];
    expect(bars.length).toBeGreaterThan(0);
  });
});
