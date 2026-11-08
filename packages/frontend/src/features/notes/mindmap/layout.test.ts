import { describe, expect, it } from "vitest";
import { layoutMindmap, type PlacedNode } from "./layout";
import { parseMindmap } from "./parse";

const place = (
  source: string,
  collapsed: string[] = [],
  offsets: [number, { x: number; y: number }][] = [],
) => layoutMindmap(parseMindmap(source), new Set(collapsed), new Map(offsets));
const byText = (nodes: PlacedNode[], text: string) => {
  const found = nodes.find((n) => n.text === text);
  if (!found) throw new Error(`no node ${text}`);
  return found;
};

describe("layoutMindmap", () => {
  it("is the same every time for the same outline", () => {
    const source = "Root\n  A\n    A1\n  B\n  C";
    expect(place(source)).toEqual(place(source));
  });

  it("puts the root in the middle with branches on both sides", () => {
    const { nodes } = place("Root\n  A\n  B\n  C\n  D");
    const root = byText(nodes, "Root");
    const sides = nodes.filter((n) => n.depth === 1).map((n) => n.side);
    expect(sides).toEqual(["right", "right", "left", "left"]);
    expect(byText(nodes, "A").x).toBeGreaterThan(root.x + root.width);
    expect(byText(nodes, "D").x + byText(nodes, "D").width).toBeLessThan(root.x);
  });

  it("splits branches by how much is under them", () => {
    const { nodes } = place("Root\n  Big\n    1\n    2\n    3\n  Small\n  Other");
    expect(byText(nodes, "Big").side).toBe("right");
    expect(byText(nodes, "Small").side).toBe("left");
    expect(byText(nodes, "Other").side).toBe("left");
  });

  it("keeps a single branch on the right", () => {
    const { nodes } = place("Root\n  Only\n    Deep");
    expect(nodes.every((n) => n.side === "right" || n.depth === 0)).toBe(true);
  });

  it("centers a parent on its children and never overlaps rows", () => {
    const { nodes } = place("Root\n  A\n    A1\n    A2\n    A3\n  B");
    const a = byText(nodes, "A");
    const kids = ["A1", "A2", "A3"].map((t) => byText(nodes, t));
    expect(a.y).toBeCloseTo(((kids[0]?.y ?? 0) + (kids[2]?.y ?? 0)) / 2);
    for (const column of [kids, [a]]) {
      for (let i = 1; i < column.length; i++) {
        const [p, q] = [column[i - 1], column[i]];
        expect((q?.y ?? 0) - (p?.y ?? 0)).toBeGreaterThanOrEqual(p?.height ?? 0);
      }
    }
  });

  it("lays several top level lines out as separate trees stacked down the right", () => {
    const { nodes } = place("One\n  a\nTwo\n  b");
    expect(nodes.filter((n) => n.depth === 0).map((n) => n.text)).toEqual(["One", "Two"]);
    expect(nodes.every((n) => n.side === "right")).toBe(true);
    expect(byText(nodes, "Two").y).toBeGreaterThan(byText(nodes, "a").y);
  });

  it("hides what is under a collapsed node and says how much", () => {
    const open = place("Root\n  A\n    A1\n    A2\n  B");
    const folded = place("Root\n  A\n    A1\n    A2\n  B", ["0.0"]);
    expect(folded.nodes.map((n) => n.text)).toEqual(["Root", "A", "B"]);
    const a = byText(folded.nodes, "A");
    expect(a.collapsed).toBe(true);
    expect(a.hiddenCount).toBe(2);
    expect(byText(open.nodes, "A").collapsed).toBe(false);
    expect(folded.height).toBeLessThan(open.height);
  });

  it("gives a node its path as id, and edges between parent and child ids", () => {
    const { nodes, edges } = place("Root\n  A\n    A1");
    expect(nodes.map((n) => n.id)).toEqual(["0", "0.0", "0.0.0"]);
    expect(edges.map((e) => [e.from, e.to])).toEqual([
      ["0", "0.0"],
      ["0.0", "0.0.0"],
    ]);
  });

  it("keeps every node inside the picture", () => {
    const { nodes, width, height } = place("Root\n  A\n    A1\n  B\n  C\n    C1\n    C2");
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y - n.height / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width).toBeLessThanOrEqual(width);
      expect(n.y + n.height / 2).toBeLessThanOrEqual(height);
    }
  });

  it("is empty for an empty outline", () => {
    expect(place("").nodes).toEqual([]);
  });
});

describe("layoutMindmap with dragged nodes", () => {
  const SOURCE = "Root\n  A\n    A1\n    A2\n  B\n  C";

  it("moves a dragged node by its offset from the automatic place", () => {
    const auto = place(SOURCE);
    const moved = place(SOURCE, [], [[4, { x: 30, y: 20 }]]);
    const [before, after] = [byText(auto.nodes, "B"), byText(moved.nodes, "B")];
    // The picture is moved back to its padding, so compare against a node that stayed.
    const [rootBefore, rootAfter] = [byText(auto.nodes, "Root"), byText(moved.nodes, "Root")];
    expect(after.x - rootAfter.x).toBeCloseTo(before.x - rootBefore.x + 30);
    expect(after.y - rootAfter.y).toBeCloseTo(before.y - rootBefore.y + 20);
  });

  it("takes the whole subtree along, and adds a child's own offset to its parent's", () => {
    const auto = place(SOURCE);
    const moved = place(
      SOURCE,
      [],
      [
        [1, { x: 0, y: 50 }],
        [2, { x: 10, y: 0 }],
      ],
    );
    const gap = (nodes: typeof auto.nodes, text: string) =>
      byText(nodes, text).y - byText(nodes, "Root").y;
    const across = (nodes: typeof auto.nodes, text: string) =>
      byText(nodes, text).x - byText(nodes, "Root").x;
    expect(gap(moved.nodes, "A")).toBeCloseTo(gap(auto.nodes, "A") + 50);
    expect(gap(moved.nodes, "A1")).toBeCloseTo(gap(auto.nodes, "A1") + 50);
    expect(gap(moved.nodes, "A2")).toBeCloseTo(gap(auto.nodes, "A2") + 50);
    expect(across(moved.nodes, "A1")).toBeCloseTo(across(auto.nodes, "A1") + 10);
    expect(across(moved.nodes, "A2")).toBeCloseTo(across(auto.nodes, "A2"));
  });

  it("moves everything with the root and keeps every node inside the picture", () => {
    const moved = place(
      SOURCE,
      [],
      [
        [0, { x: -200, y: 120 }],
        [5, { x: 300, y: -400 }],
      ],
    );
    for (const n of moved.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y - n.height / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width).toBeLessThanOrEqual(moved.width);
      expect(n.y + n.height / 2).toBeLessThanOrEqual(moved.height);
    }
  });

  it("ignores an offset for a node that is folded away or a line that is not a node", () => {
    const folded = place(SOURCE, ["0.0"], [[2, { x: 99, y: 99 }]]);
    expect(folded).toEqual(place(SOURCE, ["0.0"]));
    expect(place(SOURCE, [], [[40, { x: 5, y: 5 }]])).toEqual(place(SOURCE));
  });

  it("tells each node its outline line", () => {
    expect(place(SOURCE).nodes.map((n) => [n.text, n.line])).toEqual([
      ["Root", 0],
      ["A", 1],
      ["A1", 2],
      ["A2", 3],
      ["B", 4],
      ["C", 5],
    ]);
  });
});
