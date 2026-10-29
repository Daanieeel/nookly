import { describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import type { Block, BlockType } from "#/lib/api/types.ts";
import { BLOCK_EXPORTERS, markerFor, pageDocument, runsOf } from "./page-document.ts";

const block = (blockType: BlockType, content: string, patch: Partial<Block> = {}) =>
  makeBlock({ blockType, content, ...patch });

const one = (b: Block) => pageDocument("Page", [b]).blocks;

describe("pageDocument", () => {
  it("keeps the AI comment tone of a callout", () => {
    const [callout] = one(block("callout", "Changed the order", { attrs: { variant: "ai" } }));
    expect(callout).toMatchObject({ kind: "callout", tone: "ai" });
  });

  it("keeps the blocks in page order", () => {
    const doc = pageDocument("Physics", [
      block("paragraph", "second", { position: 2 }),
      block("heading1", "first", { position: 1 }),
    ]);
    expect(doc.title).toBe("Physics");
    expect(doc.blocks.map((b) => b.kind)).toEqual(["heading", "paragraph"]);
  });

  it("reads inline marks, links and math into runs", () => {
    expect(runsOf("**bold** *it* `code` ==mark== [site](https://x.dev) $x^2$")).toEqual([
      { kind: "text", text: "bold", bold: true },
      { kind: "text", text: " " },
      { kind: "text", text: "it", italic: true },
      { kind: "text", text: " " },
      { kind: "text", text: "code", code: true },
      { kind: "text", text: " " },
      { kind: "text", text: "mark", highlight: "yellow" },
      { kind: "text", text: " " },
      { kind: "text", text: "site", link: "https://x.dev" },
      { kind: "text", text: " " },
      { kind: "math", latex: "x^2" },
    ]);
  });

  it("reads a text colour into a run, next to the other marks", () => {
    expect(runsOf("a {red}b **c**{/} {chartreuse}d{/}")).toEqual([
      { kind: "text", text: "a " },
      { kind: "text", text: "b ", color: "red" },
      { kind: "text", text: "c", bold: true, color: "red" },
      { kind: "text", text: " {chartreuse}d{/}" },
    ]);
  });

  it("counts numbered lists the way the editor does, nested lists included", () => {
    const [list] = one(
      block("numbered_list", "one\n\tinner\ntwo", { attrs: { marker: "a)", start: "2" } }),
    );
    expect(list).toMatchObject({
      kind: "list",
      items: [
        { marker: "b)", children: [{ marker: "a)" }] },
        { marker: "c)", children: [] },
      ],
    });
  });

  it("marks bullets by depth and checklist items by state", () => {
    expect(one(block("bulleted_list", "a\n\tb"))[0]).toMatchObject({
      items: [{ marker: "•", children: [{ marker: "◦" }] }],
    });
    expect(one(block("checklist", "[x] done\n[ ] open"))[0]).toMatchObject({
      items: [{ checked: true }, { checked: false }],
    });
  });

  it("lays a table out with its first row as the header", () => {
    expect(one(block("table", "Name\tAge\nAda\t36"))[0]).toMatchObject({
      kind: "table",
      header: true,
      rows: [
        [{ runs: [{ text: "Name" }] }, { runs: [{ text: "Age" }] }],
        [{}, {}],
      ],
    });
  });

  it("puts a framed block's title above it", () => {
    const blocks = one(block("details", "Room\tB 204", { attrs: { title: "Course" } }));
    expect(blocks.map((b) => b.kind)).toEqual(["caption-title", "table"]);
  });

  it("draws progress as a filled bar with its numbers", () => {
    const [table] = one(block("progress", "Chapters\t3\t12"));
    expect(table).toMatchObject({
      rows: [[{}, { bar: 0.25, runs: [{ text: "3 of 12" }] }, { runs: [{ text: "25%" }] }]],
    });
  });

  it("nests a tree by its indent", () => {
    expect(one(block("tree", "src\n  main.rs\n  db\n    notes.rs"))[0]).toMatchObject({
      items: [{ children: [{ children: [] }, { children: [{ runs: [{ text: "notes.rs" }] }] }] }],
    });
  });

  it("ticks off the steps before the current one", () => {
    const [list] = one(
      block("steps", "Register\tBefore Oct 1\nPay\nMove", { attrs: { current: "2" } }),
    );
    expect(list).toMatchObject({
      items: [
        { marker: "✓", children: [{ runs: [{ text: "Before Oct 1", muted: true }] }] },
        { marker: "2.", runs: [{ bold: true }] },
        { marker: "3." },
      ],
    });
  });

  it("turns formulas, diagrams and circuits into figures that keep their source", () => {
    expect(one(block("math", "a &= b\n&= c"))[0]).toMatchObject({
      kind: "figure",
      source: { type: "math", latex: "\\begin{aligned}\na &= b \\\\\n&= c\n\\end{aligned}" },
      fallback: "a &= b\n&= c",
    });
    expect(one(block("diagram", "flowchart LR\n A-->B"))[0]).toMatchObject({
      source: { type: "diagram" },
    });
    expect(one(block("plot", "f(x) = x^2"))[0]).toMatchObject({
      source: { type: "plot", source: "f(x) = x^2" },
      fallback: "f(x) = x^2",
    });
    expect(one(block("equation", " "))).toEqual([]);
  });

  it("shows an image from its File and names other media with a link", () => {
    expect(
      one(block("image", "[cat.png](mention:f1)", { attrs: { caption: "Our cat" } }))[0],
    ).toEqual({
      kind: "figure",
      source: { type: "image", fileId: "f1", url: undefined },
      fallback: "Our cat",
      caption: "Our cat",
    });
    expect(one(block("video", "https://x.dev/talk.mp4"))[0]).toMatchObject({
      kind: "paragraph",
      runs: [{ text: "Video: " }, { text: "talk.mp4", link: "https://x.dev/talk.mp4" }],
    });
  });

  it("names a card or bookmark by its title, linked to the entity", () => {
    expect(one(block("bookmark", "[MDN](mention:b1)"))[0]).toMatchObject({
      runs: [{ text: "MDN", bold: true, link: "mention:b1" }],
    });
  });

  it("still exports the text of a block type it does not know", () => {
    // SAFETY: a block type from a newer app, which this version's union does not name.
    const future = "hologram" as BlockType;
    expect(one(block(future, "from the future"))[0]).toMatchObject({
      kind: "paragraph",
      runs: [{ text: "from the future" }],
    });
  });

  it("has a print layout for every block type", () => {
    for (const [type, exporter] of Object.entries(BLOCK_EXPORTERS)) {
      // SAFETY: the keys of `BLOCK_EXPORTERS` are exactly the block types.
      expect(() => exporter(block(type as BlockType, ""))).not.toThrow();
    }
  });
});

describe("markerFor", () => {
  it.each([
    [null, 0, "1."],
    ["a.", 0, "a."],
    ["A)", 1, "B)"],
    ["a.", 26, "aa."],
  ])("%s at %i is %s", (marker, index, expected) => {
    expect(markerFor(marker, index)).toBe(expected);
  });
});
