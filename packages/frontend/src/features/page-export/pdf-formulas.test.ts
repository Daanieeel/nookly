import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { ExportDocument } from "./document-model.ts";
import { defaultOptions } from "./export-options.ts";
import { placeFormulas } from "./pdf-formulas.ts";
import { BODY_METRICS, PDF_FONTS, pdfLayout } from "./render-pdf.ts";

const require = createRequire(import.meta.url);

/// A 1x1 PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/// The PDF as the app makes it, with pdfmake's browser build and the fonts it embeds.
async function render(doc: ExportDocument) {
  // SAFETY: the browser build is the same pdfmake API, typed only for the package root.
  const pdfMake = ((await import("pdfmake/build/pdfmake")) as { default: typeof import("pdfmake") })
    .default;
  const font = (path: string) => readFileSync(require.resolve(path)).toString("base64");
  pdfMake.addVirtualFileSystem({
    "inter.ttf": font("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
  });
  const face = {
    normal: "inter.ttf",
    bold: "inter.ttf",
    italics: "inter.ttf",
    bolditalics: "inter.ttf",
  };
  pdfMake.setFonts({ [PDF_FONTS.body]: face, [PDF_FONTS.mono]: face, [PDF_FONTS.math]: face });
  const layout = pdfLayout(doc, defaultOptions());
  const bytes = await pdfMake.createPdf({ ...layout.definition, compress: false }).getBuffer();
  return { bytes: new Uint8Array(bytes), formulas: layout.formulas };
}

async function pageContent(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  const text = refs
    .map((ref) => pdf.context.lookup(ref))
    .filter((stream) => stream instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join("\n");
  const links = (page.node.Annots()?.asArray() ?? []).map((ref) => String(pdf.context.lookup(ref)));
  return { text, links };
}

describe("placeFormulas", () => {
  it("knows how Inter is measured", () => {
    // pdfkit measures a font per 1000 units: Inter has 2048 to the em.
    const inter = readFileSync(
      require.resolve("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    );
    const head = inter.indexOf("head");
    const hhea = inter.indexOf("hhea");
    const table = (at: number) => inter.readUInt32BE(at + 8);
    const unitsPerEm = inter.readUInt16BE(table(head) + 18);
    expect(inter.readInt16BE(table(hhea) + 4) / unitsPerEm).toBe(BODY_METRICS.ascent);
    expect(-inter.readInt16BE(table(hhea) + 6) / unitsPerEm).toBe(BODY_METRICS.descent);
  });

  it("draws each inline formula on the line's baseline, in the room left for it", async () => {
    const image = { png: PNG, width: 16, height: 40, depth: 12 };
    const { bytes, formulas } = await render({
      title: "",
      blocks: [
        {
          kind: "paragraph",
          runs: [
            { kind: "text", text: "so " },
            { kind: "math", latex: "\\frac{a}{b}", image },
            { kind: "text", text: " then" },
          ],
        },
      ],
    });
    const before = await pageContent(bytes);
    const baseline = Number(/1 0 0 1 [\d.]+ ([\d.]+) Tm/.exec(before.text)?.[1]);

    const placed = await pageContent(await placeFormulas(bytes, formulas));
    expect(placed.links.join()).not.toContain("/Link");
    const [formula] = formulas;
    // pdf-lib moves to the corner, then scales the picture to its size.
    const drawn =
      /1 0 0 1 [\d.]+ ([\d.-]+) cm\s+1 0 0 1 0 0 cm\s+([\d.]+) 0 0 ([\d.]+) 0 0 cm\s+1 0 0 1 0 0 cm\s+\/\S+ Do/.exec(
        placed.text,
      );
    expect(drawn).not.toBeNull();
    const [, bottom, width, height] = (drawn ?? []).map(Number);
    expect(width).toBeCloseTo(formula?.width ?? 0, 2);
    expect(height).toBeCloseTo((formula?.ascent ?? 0) + (formula?.depth ?? 0), 2);
    expect((bottom ?? 0) + (formula?.depth ?? 0)).toBeCloseTo(baseline, 2);
  });

  it("leaves a PDF without formulas as it is", async () => {
    const { bytes } = await render({
      title: "",
      blocks: [{ kind: "paragraph", runs: [{ kind: "text", text: "plain" }] }],
    });
    expect(await placeFormulas(bytes, [])).toBe(bytes);
  });
});
