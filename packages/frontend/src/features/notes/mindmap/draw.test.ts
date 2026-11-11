import { describe, expect, it } from "vitest";
import { drawMindmap } from "./draw";
import { layoutMindmap } from "./layout";
import { parseMindmap } from "./parse";

const draw = (source: string, collapsed: string[] = [], dark = false) =>
  drawMindmap(layoutMindmap(parseMindmap(source), new Set(collapsed)), dark);

const edgeStarts = (svg: string) =>
  [...svg.matchAll(/data-edge="" d="M([\d.-]+),/g)].map((m) => Number(m[1]));

describe("drawMindmap", () => {
  it("draws a node and a connector for every line but the root", () => {
    const svg = draw("Root\n  A\n    A1\n  B");
    expect(svg.match(/data-node="/g)).toHaveLength(4);
    expect(svg.match(/data-edge=""/g)).toHaveLength(3);
    for (const text of ["Root", "A", "A1", "B"]) expect(svg).toContain(`>${text}</text>`);
  });

  it("escapes the text of a node", () => {
    const svg = draw('Root\n  <b onload="x">&</b>');
    expect(svg).not.toContain("<b ");
    expect(svg).toContain("&lt;b onload=&quot;x&quot;&gt;&amp;&lt;/b&gt;");
  });

  it("cuts long text and keeps all of it in the tooltip", () => {
    const long = "word ".repeat(30).trim();
    const svg = draw(`Root\n  ${long}`);
    expect(svg).toContain("…</text>");
    expect(svg).toContain(`<title>${long}</title>`);
  });

  it("marks nodes with children as buttons that say whether they are open", () => {
    const svg = draw("Root\n  A\n    A1\n  B", ["0.0"]);
    expect(svg).toMatch(/data-node="0\.0"[^>]*role="button"[^>]*aria-expanded="false"/);
    expect(svg).toMatch(/data-node="0"[^>]*role="button"[^>]*aria-expanded="true"/);
    // A leaf cannot be folded.
    expect(svg).not.toMatch(/data-node="0\.1"[^>]*role="button"/);
  });

  it("shows how many nodes a folded one hides", () => {
    const svg = draw("Root\n  A\n    A1\n    A2\n  B", ["0.0"]);
    expect(svg).toContain(">+2</text>");
  });

  it("takes the color of the text around it and sets the size from the layout", () => {
    const layout = layoutMindmap(parseMindmap("Root\n  A"), new Set());
    const svg = drawMindmap(layout, false);
    expect(svg).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
    expect(svg).toContain("currentColor");
  });

  it("uses lighter branch colors on a dark page", () => {
    expect(draw("Root\n  A", [], true)).not.toEqual(draw("Root\n  A", [], false));
  });

  it("draws nothing for an empty outline", () => {
    expect(draw("")).toBe("");
  });

  it("tells each node's outline line, so a drag knows what it moved", () => {
    const svg = draw("Root\n  A\n\n  B");
    expect(svg).toMatch(/data-node="0" data-line="0"/);
    expect(svg).toMatch(/data-node="0\.1" data-line="3"/);
  });

  it("joins a node to its parent on the side it was dragged to", () => {
    const parse = parseMindmap("Root\n  A\n  B\n  C\n  D");
    const plain = layoutMindmap(parse, new Set());
    const a = plain.nodes.find((n) => n.text === "A");
    const root = plain.nodes.find((n) => n.text === "Root");
    if (!a || !root) throw new Error("missing nodes");
    // A sits right of the root; drag it far to the left of it.
    const dragged = layoutMindmap(parse, new Set(), new Map([[1, { x: -600, y: 0 }]]));
    const rootAfter = dragged.nodes.find((n) => n.text === "Root");
    if (!rootAfter) throw new Error("missing root");
    const starts = edgeStarts(drawMindmap(dragged, false));
    // The connector to A leaves the root's left edge, not its right.
    expect(starts[0]).toBeCloseTo(rootAfter.x);
    expect(edgeStarts(drawMindmap(plain, false))[0]).toBeCloseTo(root.x + root.width);
  });
});
