import JSZip from "jszip";
import { Packer } from "docx";
import { describe, expect, it } from "vitest";
import type { ExportDocument, ExportImage } from "./document-model.ts";
import { type PageExportOptions, defaultOptions } from "./export-options.ts";
import { docxDocument } from "./render-docx.ts";
import { escapeXml, odfText, odtBytes, odtFiles } from "./render-odt.ts";
import { pdfDefinition } from "./render-pdf.ts";

/// A 1x1 PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const image: ExportImage = { png: PNG, width: 400, height: 200 };

const doc: ExportDocument = {
  title: "Physics & waves",
  blocks: [
    { kind: "heading", level: 2, runs: [{ kind: "text", text: "Week 3" }] },
    {
      kind: "paragraph",
      runs: [
        { kind: "text", text: "Read " },
        { kind: "text", text: "chapter 4", bold: true },
        { kind: "text", text: " at ", italic: true },
        { kind: "text", text: "the site", link: "https://x.dev" },
      ],
    },
    {
      kind: "list",
      items: [
        { runs: [{ kind: "text", text: "first" }], marker: "1.", children: [] },
        { runs: [{ kind: "text", text: "done" }], marker: "", checked: true, children: [] },
      ],
    },
    { kind: "code", text: "fn main() {\n    run();\n}", label: "main.rs" },
    { kind: "callout", tone: "warning", runs: [{ kind: "text", text: "Hot" }] },
    {
      kind: "table",
      header: true,
      rows: [
        [{ runs: [{ kind: "text", text: "Name" }] }, { runs: [{ kind: "text", text: "Age" }] }],
        [
          { runs: [{ kind: "text", text: "Ada" }] },
          { runs: [{ kind: "text", text: "36" }], bar: 0.5 },
        ],
      ],
    },
    {
      kind: "figure",
      source: { type: "math", latex: "x^2" },
      image,
      fallback: "x^2",
      caption: "Square",
    },
    { kind: "figure", source: { type: "diagram", source: "graph" }, fallback: "flowchart LR" },
    { kind: "rule" },
  ],
};

const options = (patch: Partial<PageExportOptions> = {}): PageExportOptions => ({
  ...defaultOptions(),
  ...patch,
});

describe("pdfDefinition", () => {
  it("puts the title on top only when asked", () => {
    const withTitle = pdfDefinition(doc, options({ includeTitle: true }));
    const without = pdfDefinition(doc, options({ includeTitle: false }));
    expect(JSON.stringify(withTitle.content)).toContain("Physics & waves");
    expect(JSON.stringify(without.content)).not.toContain("Physics & waves");
    expect(withTitle.info?.title).toBe("Physics & waves");
  });

  it("sizes and turns the page", () => {
    expect(pdfDefinition(doc, options({ pageSize: "a4" })).pageSize).toEqual({
      width: 595.28,
      height: 841.89,
    });
    expect(pdfDefinition(doc, options({ pageSize: "letter", landscape: true })).pageSize).toEqual({
      width: 792,
      height: 612,
    });
    expect(pdfDefinition(doc, options({ margins: "none" })).pageMargins).toBe(0);
  });

  it("embeds drawn figures and shows the source of one that could not be drawn", () => {
    const content = JSON.stringify(pdfDefinition(doc, options()).content);
    expect(content).toContain("data:image/png;base64,");
    expect(content).toContain("flowchart LR");
    expect(content).toContain('"link":"https://x.dev"');
  });
});

async function docxXml(document: ExportDocument, opts: PageExportOptions): Promise<string> {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(docxDocument(document, opts)));
  return (await zip.file("word/document.xml")?.async("string")) ?? "";
}

describe("docxDocument", () => {
  it("writes headings as Word headings and keeps the text and marks", async () => {
    const xml = await docxXml(doc, options());
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('w:val="Title"');
    expect(xml).toContain("Physics &amp; waves");
    expect(xml).toContain("chapter 4");
    expect(xml).toMatch(/<w:b\/>.*chapter 4/s);
    expect(xml).toContain("w:hyperlink");
    expect(xml).toContain("☒");
    expect(xml).toContain("flowchart LR");
  });

  it("leaves the title out when asked", async () => {
    const xml = await docxXml(doc, options({ includeTitle: false }));
    expect(xml).not.toContain('w:val="Title"');
  });

  it("sets the page size, orientation and margins", async () => {
    const xml = await docxXml(
      doc,
      options({ pageSize: "letter", landscape: true, margins: "narrow" }),
    );
    expect(xml).toMatch(/<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"\/>/);
    expect(xml).toContain('w:top="567"');
  });

  it("packs the figure as a picture", async () => {
    const zip = await JSZip.loadAsync(await Packer.toBuffer(docxDocument(doc, options())));
    expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(true);
  });
});

describe("odtFiles", () => {
  it("writes the outline, the text and the marks", () => {
    const { content } = odtFiles(doc, options());
    expect(content).toContain('<text:h text:style-name="Heading_20_2" text:outline-level="2">');
    expect(content).toContain('text:style-name="Title">Physics &amp; waves');
    expect(content).toContain('xlink:href="https://x.dev"');
    expect(content).toContain("<table:table-header-rows>");
    expect(content).toContain("Pictures/image1.png");
    expect(content).toContain("flowchart LR");
  });

  it("keeps code indentation and line breaks", () => {
    const { content } = odtFiles(doc, options());
    expect(content).toContain(
      'fn main() {<text:line-break/><text:s text:c="4"/>run();<text:line-break/>}',
    );
  });

  it("sets the page size and orientation", () => {
    const { styles } = odtFiles(doc, options({ pageSize: "a5", landscape: true }));
    expect(styles).toContain('fo:page-width="595.28pt" fo:page-height="419.53pt"');
    expect(styles).toContain('style:print-orientation="landscape"');
  });

  it("zips a file whose first entry is its uncompressed type", async () => {
    const bytes = await odtBytes(doc, options());
    const head = new TextDecoder().decode(bytes.slice(30, 38 + 39));
    expect(head).toBe("mimetypeapplication/vnd.oasis.opendocument.text");
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("Pictures/image1.png")).not.toBeNull();
    expect(await zip.file("META-INF/manifest.xml")?.async("string")).toContain(
      "Pictures/image1.png",
    );
  });
});

describe("odfText", () => {
  it("escapes markup and keeps runs of spaces, tabs and breaks", () => {
    expect(odfText("a  b\tc\n<d>")).toBe(
      'a <text:s text:c="1"/>b<text:tab/>c<text:line-break/>&lt;d&gt;',
    );
    expect(escapeXml("x\u0001y")).toBe("xy");
  });
});
