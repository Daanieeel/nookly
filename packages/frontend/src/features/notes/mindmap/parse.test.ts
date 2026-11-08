import { describe, expect, it } from "vitest";
import { parseMindmap, type MindNode } from "./parse";

/// A node as nested text, so a test reads like the outline.
type Outline = string | { [text: string]: Outline[] };

const outlineOf = (node: MindNode): Outline =>
  node.children.length ? { [node.text]: node.children.map(outlineOf) } : node.text;

describe("parseMindmap", () => {
  it("reads an indented list, one node per line", () => {
    const map = parseMindmap("Plan\n  Read\n    Chapter 1\n  Write\nLater");
    expect(map.roots.map(outlineOf)).toEqual([
      { Plan: [{ Read: ["Chapter 1"] }, "Write"] },
      "Later",
    ]);
  });

  it("takes a tab, two spaces or four spaces as one level", () => {
    const tabs = parseMindmap("A\n\tB\n\t\tC");
    const four = parseMindmap("A\n    B\n        C");
    const two = parseMindmap("A\n  B\n    C");
    expect(tabs.roots.map(outlineOf)).toEqual([{ A: [{ B: ["C"] }] }]);
    expect(four.roots.map(outlineOf)).toEqual(tabs.roots.map(outlineOf));
    expect(two.roots.map(outlineOf)).toEqual(tabs.roots.map(outlineOf));
  });

  it("ignores list markers, blank lines and Windows line endings", () => {
    const map = parseMindmap("- A\r\n\r\n  * B\r\n  + C\r\n   -\r\n");
    expect(map.roots.map(outlineOf)).toEqual([{ A: ["B", "C"] }]);
  });

  it("keeps text that only starts like a marker", () => {
    const map = parseMindmap("-5 degrees\n  *bold* idea\n  a - b");
    expect(map.roots.map(outlineOf)).toEqual([{ "-5 degrees": ["*bold* idea", "a - b"] }]);
  });

  it("puts a line indented deeper than any line before it under the nearest shallower one", () => {
    const map = parseMindmap("A\n      B\n  C\n        D");
    expect(map.roots.map(outlineOf)).toEqual([{ A: ["B", { C: ["D"] }] }]);
  });

  it("treats a line that dedents to no earlier level as a sibling of the closest one", () => {
    const map = parseMindmap("A\n    B\n  C");
    expect(map.roots.map(outlineOf)).toEqual([{ A: ["B", "C"] }]);
  });

  it("records the source line of each node", () => {
    const map = parseMindmap("A\n\n  B\nC");
    const lines = (n: MindNode): number[] => [n.line, ...n.children.flatMap(lines)];
    expect(map.roots.flatMap(lines)).toEqual([0, 2, 3]);
  });

  it("gives nothing for an empty outline", () => {
    expect(parseMindmap("  \n\n").roots).toEqual([]);
  });
});
