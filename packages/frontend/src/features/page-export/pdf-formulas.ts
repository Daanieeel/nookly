import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
} from "pdf-lib";
import { BODY_METRICS, type InlineFormula, formulaLink } from "./render-pdf.ts";

/// The link's URL, when the annotation is a link to one.
function linkUrl(annotation: PDFDict): string | null {
  const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
  const uri = action?.lookup(PDFName.of("URI"));
  return uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : null;
}

/// The top of a link's rectangle, in PDF points from the bottom of the page.
function rectTop(annotation: PDFDict): number | null {
  const rect = annotation.lookupMaybe(PDFName.of("Rect"), PDFArray);
  const ys = [rect?.lookup(1), rect?.lookup(3)].filter((y) => y instanceof PDFNumber);
  return ys.length === 2 ? Math.max(...ys.map((y) => y.asNumber())) : null;
}

/// Draws each inline formula into the room `pdfLayout` left for it in the text, found by
/// its link, which goes. pdfkit puts the top of that link where the placeholder's text
/// starts, one ascent above the baseline.
export async function placeFormulas(
  bytes: Uint8Array,
  formulas: InlineFormula[],
): Promise<Uint8Array> {
  if (formulas.length === 0) return bytes;
  const pdf = await PDFDocument.load(bytes);
  const links = new Map(formulas.map((formula, i) => [formulaLink(i), formula]));
  const images = new Map<InlineFormula, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    // Backwards, so removing one keeps the indexes still to come.
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annotation = annots.lookupMaybe(i, PDFDict);
      const formula = annotation && links.get(linkUrl(annotation) ?? "");
      const top = annotation && rectTop(annotation);
      if (!formula || top == null) continue;
      annots.remove(i);
      let image = images.get(formula);
      if (!image) {
        image = await pdf.embedPng(formula.image.png);
        images.set(formula, image);
      }
      const rect = annotation.lookup(PDFName.of("Rect"), PDFArray);
      const baseline = top - BODY_METRICS.ascent * formula.fontSize;
      page.drawImage(image, {
        x: rect.lookup(0, PDFNumber).asNumber(),
        y: baseline - formula.depth,
        width: formula.width,
        height: formula.ascent + formula.depth,
      });
    }
  }
  return pdf.save();
}
