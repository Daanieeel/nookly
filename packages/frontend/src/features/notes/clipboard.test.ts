import { getSchema, type JSONContent } from "@tiptap/core";
import { DOMParser as PMParser, DOMSerializer, Fragment, type Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions";

const schema = getSchema(editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }));

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
const atom = (type: string, rows: string, attrs: Record<string, string> = {}): JSONContent => ({
  type,
  attrs: { rows, ...attrs },
});

/// One sample of every block the editor can hold. The coverage test below fails
/// for a block type missing here, so a new block can't ship without a copy test.
const SAMPLES = {
  paragraph: paragraph("Plain text"),
  heading: { type: "heading", attrs: { level: 3 }, content: [text("Heading")] },
  blockquote: { type: "blockquote", content: [paragraph("Quoted")] },
  codeBlock: { type: "codeBlock", attrs: { language: "plaintext" }, content: [text("let x = 1")] },
  bulletList: {
    type: "bulletList",
    content: [{ type: "listItem", content: [paragraph("One")] }],
  },
  orderedList: {
    type: "orderedList",
    content: [{ type: "listItem", content: [paragraph("One")] }],
  },
  taskList: {
    type: "taskList",
    content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Done")] }],
  },
  table: {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [paragraph("A")] },
          { type: "tableHeader", content: [paragraph("B")] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [paragraph("1")] },
          { type: "tableCell", content: [paragraph("2")] },
        ],
      },
    ],
  },
  callout: { type: "callout", attrs: { variant: "note" }, content: [text("Heads up")] },
  toggle: { type: "toggle", attrs: { toggle: "open" }, content: [paragraph("Summary")] },
  equation: { type: "equation", attrs: { view: "rendered" }, content: [text("E = mc^2")] },
  math: { type: "math", attrs: { view: "rendered" }, content: [text("a &= b \\\\\nc &= d")] },
  diagram: { type: "diagram", attrs: { view: "source" }, content: [text("graph TD; A-->B")] },
  divider: { type: "divider" },
  timeline: atom("timeline", "2026\tStart\tnow", { title: "Plan" }),
  progress: atom("progress", "Reading\t3\t10", { title: "Goals" }),
  tree: atom("tree", "Root\n  Child", { title: "Outline" }),
  steps: atom("steps", "Register\tBefore Oct 1", { title: "How" }),
  stats: atom("stats", "92%\tAverage\tup", { title: "Numbers" }),
  details: atom("details", "Room\t12", { title: "Facts" }),
  entity_card: atom("entity_card", "[Task](mention:abc)"),
  image: atom("image", "https://example.com/a.png", { caption: "A picture" }),
  video: atom("video", "https://example.com/a.mp4", { caption: "A clip" }),
  audio: atom("audio", "https://example.com/a.mp3", { caption: "A song" }),
  file: atom("file", "https://example.com/a.pdf", { caption: "A file" }),
  embed: atom("embed", "https://www.youtube.com/watch?v=abc"),
  bookmark: atom("bookmark", "https://example.com"),
} satisfies Record<string, JSONContent>;

/// What copying then pasting does: the clipboard HTML the editor writes, read
/// back through the same schema's parse rules.
function copyPaste(block: Node): Node[] {
  const html = document.createElement("div");
  html.append(DOMSerializer.fromSchema(schema).serializeFragment(Fragment.from(block)));
  const slice = PMParser.fromSchema(schema).parseSlice(html, { preserveWhitespace: "full" });
  const pasted: Node[] = [];
  slice.content.forEach((node) => pasted.push(node));
  return pasted;
}

describe("copy and paste of blocks", () => {
  const nested = new Set(["listItem", "taskItem", "tableRow", "tableCell", "tableHeader"]);

  it("has a sample for every block type", () => {
    const blocks = Object.values(schema.nodes)
      .filter((type) => type.spec.group?.split(" ").includes("block") && !nested.has(type.name))
      .map((type) => type.name);
    expect(Object.keys(SAMPLES).toSorted()).toEqual(blocks.toSorted());
  });

  it.each(Object.entries(SAMPLES))("a %s block pastes back as itself", (_name, json) => {
    const block = schema.nodeFromJSON(json);
    const pasted = copyPaste(block);
    expect(pasted).toHaveLength(1);
    expect(pasted[0].type.name).toBe(block.type.name);
    expect(pasted[0].toJSON()).toEqual(block.toJSON());
  });
});
