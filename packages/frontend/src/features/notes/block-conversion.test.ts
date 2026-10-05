import { getSchema, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { BLOCK_KINDS, convertedBlocks, turnIntoKinds } from "./block-conversion";
import { editorExtensions } from "./editor-extensions";
import { SLASH_ITEMS } from "./slash-command-extension";

const schema = getSchema(editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }));

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({
  type: "paragraph",
  content: value ? [text(value)] : [],
});
const node = (json: JSONContent) => schema.nodeFromJSON(json);
const atom = (type: string, rows: string, attrs: Record<string, string> = {}) =>
  node({ type, attrs: { rows, ...attrs } });
const titles = (source: ReturnType<typeof node>) => turnIntoKinds(source).map((k) => k.title);
const convert = (source: ReturnType<typeof node>, title: string) => {
  const kind = BLOCK_KINDS.find((k) => k.title === title);
  if (!kind) throw new Error(`no kind ${title}`);
  return convertedBlocks(source, kind, schema)?.map((n) => n.toJSON());
};
/// Expected blocks in the form the schema reads back, with every default filled in.
const blocks = (...json: JSONContent[]) => json.map((j) => node(j).toJSON());

const list = (type: string, ...items: string[]) => ({
  type,
  content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
});

describe("turn into kinds", () => {
  it("only offers kinds the slash menu has, so icons and descriptions exist", () => {
    for (const kind of BLOCK_KINDS) {
      expect(SLASH_ITEMS.some((item) => item.title === kind.title)).toBe(true);
    }
  });

  it("never offers the block's own kind", () => {
    expect(titles(node(paragraph("a")))).not.toContain("Text");
    expect(
      titles(node({ type: "heading", attrs: { level: 2 }, content: [text("a")] })),
    ).not.toContain("Heading 2");
  });

  it("offers text every text, list, source and row kind", () => {
    const offered = titles(node(paragraph("a")));
    for (const title of [
      "Heading 1",
      "Toggle heading",
      "Toggle",
      "Quote",
      "Callout",
      "Code block",
      "Bulleted list",
      "Checklist",
      "Steps",
      "Tree",
      "Details",
      "Stats",
      "Progress",
      "Timeline",
      "Equation",
      "Math block",
      "Diagram",
    ]) {
      expect(offered).toContain(title);
    }
  });

  it("offers link blocks for a URL line only", () => {
    expect(titles(node(paragraph("hello")))).not.toContain("Web bookmark");
    const offered = titles(node(paragraph("https://example.com")));
    for (const title of ["Web bookmark", "Embed", "Image", "Video", "Audio", "File"]) {
      expect(offered).toContain(title);
    }
  });

  it("limits stats to four rows", () => {
    expect(titles(node(list("bulletList", "a", "b", "c", "d")))).toContain("Stats");
    expect(titles(node(list("bulletList", "a", "b", "c", "d", "e")))).not.toContain("Stats");
  });

  it("turns every row block into text and the other row blocks", () => {
    const steps = atom("steps", "Register\tBefore Oct 1");
    const offered = titles(steps);
    expect(offered).toContain("Text");
    expect(offered).toContain("Details");
    expect(offered).toContain("Timeline");
    expect(offered).not.toContain("Steps");
    expect(offered).not.toContain("Image");
  });

  it("turns link blocks into each other, but only plain URLs into text", () => {
    const image = atom("image", "https://example.com/a.png", { caption: "Cap" });
    expect(titles(image)).toContain("Video");
    expect(titles(image)).toContain("Web bookmark");
    // The caption follows the URL as a second line, so nothing is lost.
    expect(convert(image, "Text")).toEqual(
      blocks(paragraph("https://example.com/a.png"), paragraph("Cap")),
    );
    expect(titles(atom("bookmark", "https://example.com"))).toContain("Text");
    // A stored file is a mention, which only the media blocks can show.
    const stored = atom("image", "[a.png](mention:abc)");
    expect(titles(stored)).toContain("File");
    expect(titles(stored)).not.toContain("Embed");
    expect(titles(stored)).not.toContain("Text");
  });

  it("leaves tables, dividers and linked items alone", () => {
    expect(titles(node({ type: "divider" }))).toEqual([]);
    expect(titles(atom("entity_card", "[Task](mention:abc)"))).toEqual([]);
  });

  it("turns source blocks into text and each other", () => {
    const equation = node({ type: "equation", content: [text("x^2")] });
    const offered = titles(equation);
    expect(offered).toContain("Math block");
    expect(offered).toContain("Text");
    expect(offered).not.toContain("Equation");
  });
});

describe("converted blocks", () => {
  it("keeps every line of a math block when it turns into text", () => {
    const math = node({ type: "math", content: [text("a &= b\nc &= d")] });
    expect(convert(math, "Text")).toEqual(blocks(paragraph("a &= b"), paragraph("c &= d")));
  });

  it("keeps every line of a list in a math block", () => {
    const bullets = node(list("bulletList", "a", "b"));
    expect(convert(bullets, "Math block")).toEqual(
      blocks({ type: "math", attrs: { view: "source" }, content: [text("a\nb")] }),
    );
  });

  it("turns text lines into step rows", () => {
    expect(convert(node(list("bulletList", "One", "Two")), "Steps")).toEqual(
      blocks({ type: "steps", attrs: { rows: "One\nTwo", title: null, current: null } }),
    );
  });

  it("carries rows and title between row blocks", () => {
    const steps = atom("steps", "Room\t12\nFloor\t3", { title: "Facts" });
    expect(convert(steps, "Details")).toEqual(
      blocks({ type: "details", attrs: { rows: "Room\t12\nFloor\t3", title: "Facts" } }),
    );
  });

  it("maps stats columns by meaning, value last for details", () => {
    const stats = atom("stats", "92%\tAverage\tup");
    expect(convert(stats, "Details")?.[0].attrs?.rows).toBe("Average (up)\t92%");
    const details = atom("details", "Average\t92%");
    expect(convert(details, "Stats")?.[0].attrs?.rows).toBe("92%\tAverage");
  });

  it("keeps text that is not a number when it becomes progress", () => {
    const details = atom("details", "Status\tDone\nRead\t3/8");
    expect(convert(details, "Progress")?.[0].attrs?.rows).toBe("Status: Done\t0\t10\nRead\t3\t8");
  });

  it("writes a progress row back as a ratio", () => {
    expect(convert(atom("progress", "Read\t3\t8"), "Details")?.[0].attrs?.rows).toBe("Read\t3/8");
  });

  it("puts a block title on the first line when it turns into text", () => {
    const tree = atom("tree", "Root\n  Child", { title: "Outline" });
    expect(convert(tree, "Text")).toEqual(
      blocks(paragraph("Outline"), paragraph("Root"), paragraph("Child")),
    );
  });

  it("splits a toggle into its paragraphs", () => {
    const toggle = node({ type: "toggle", content: [paragraph("Sum"), paragraph("Body")] });
    expect(convert(toggle, "Bulleted list")).toEqual(blocks(list("bulletList", "Sum", "Body")));
  });

  it("builds a toggle from the first line and body", () => {
    expect(convert(node(list("bulletList", "Sum", "Body")), "Toggle")).toEqual(
      blocks({
        type: "toggle",
        attrs: { toggle: "open" },
        content: [paragraph("Sum"), paragraph("Body")],
      }),
    );
  });

  it("keeps inline math as dollars", () => {
    const para = node({
      type: "paragraph",
      content: [text("Mass "), { type: "inlineMath", attrs: { latex: "m" } }],
    });
    expect(convert(para, "Steps")?.[0].attrs?.rows).toBe("Mass $m$");
  });

  it("turns a URL line into a link block and back", () => {
    const url = node(paragraph("https://example.com"));
    expect(convert(url, "Web bookmark")).toEqual(
      blocks({ type: "bookmark", attrs: { rows: "https://example.com" } }),
    );
    expect(convert(atom("bookmark", "https://example.com"), "Text")).toEqual(
      blocks(paragraph("https://example.com")),
    );
  });

  it("keeps a caption between media blocks", () => {
    const image = atom("image", "https://example.com/a.png", { caption: "Cap" });
    expect(convert(image, "Video")).toEqual(
      blocks({ type: "video", attrs: { rows: "https://example.com/a.png", caption: "Cap" } }),
    );
  });

  it("turns empty text into empty blocks", () => {
    expect(convert(node(paragraph("")), "Heading 1")).toEqual(
      blocks({ type: "heading", attrs: { level: 1, toggle: null } }),
    );
  });
});
