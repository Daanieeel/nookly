import type {
  CanvasElement,
  Content,
  ContentText,
  CustomTableLayout,
  TDocumentDefinitions,
  TableCell as PdfCell,
} from "pdfmake/interfaces";
import type {
  ExportBlock,
  ExportDocument,
  ExportImage,
  ListItem,
  Run,
  TableCell,
} from "./document-model.ts";
import { latexToText } from "./latex-text.ts";
import { type PageExportOptions, MARGINS, TEXT_SIZES, pageDimensions } from "./export-options.ts";
import {
  CALLOUTS,
  CAPTION_SCALE,
  CODE_SCALE,
  COLORS,
  HEADING_SCALE,
  HIGHLIGHT_FILLS,
  INLINE_MATH_EM_PX,
  TEXT_COLOR_FILLS,
  TITLE_SCALE,
  fitImage,
} from "./print-style.ts";

/// pdfmake's font family names, registered with the font files in `pdf-file.ts`.
export const PDF_FONTS = { body: "Inter", mono: "Mono", math: "Math" } as const;

/// Raised and lowered digits and letters, which the math font lacks and the body font has.
const SCRIPT_CHARACTERS = /([\u00b2\u00b3\u00b9\u1d2c-\u1d6a\u2070-\u209f\u2c7c]+)/u;

/// Inline math as text runs: in the math font, which has the symbols the body font lacks,
/// except for the raised and lowered characters only the body font has.
function mathRuns(text: string): ContentText[] {
  return text
    .split(SCRIPT_CHARACTERS)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      italics: true,
      ...(!SCRIPT_CHARACTERS.test(part) && { font: PDF_FONTS.math }),
    }));
}

const hex = (color: string) => `#${color}`;

/// Inter's regular face as pdfkit measures it, per point of font size: how far it reaches
/// above and below the baseline, and how wide a no break space is.
export const BODY_METRICS = { ascent: 0.96875, descent: 0.2412109375, space: 0.28125 } as const;

const LINE_HEIGHT = 1.3;

/// A drawn inline formula, in points, and the size of the room left for it in the text.
export interface InlineFormula {
  image: ExportImage;
  width: number;
  ascent: number;
  depth: number;
  /// The font size of the placeholder, whose top and this give the baseline.
  fontSize: number;
}

export interface PdfLayout {
  definition: TDocumentDefinitions;
  formulas: InlineFormula[];
}

/// The link that marks a formula's room, for `placeFormulas` to find and replace.
export const formulaLink = (index: number) => `nookly-formula:${index}`;

/// Room in the line for a drawn formula: two invisible no break spaces as wide as the
/// formula, sized to reach as far above the baseline and set tall enough to reach as far
/// below it. pdfmake can't place a picture inside a line of text, so `placeFormulas` draws
/// the formula over this room once the lines are laid out.
function formulaRoom(formula: Omit<InlineFormula, "fontSize">, size: number, index: number) {
  const { ascent, descent, space } = BODY_METRICS;
  const fontSize = Math.max(size, formula.ascent / ascent);
  const below = formula.depth + size * 0.2;
  return {
    formula: { ...formula, fontSize },
    run: {
      text: "\u00a0\u00a0",
      font: PDF_FONTS.body,
      bold: false,
      italics: false,
      fontSize,
      characterSpacing: formula.width - 2 * space * fontSize,
      lineHeight: Math.max(
        LINE_HEIGHT,
        (ascent * fontSize + below) / ((ascent + descent) * fontSize),
      ),
      link: formulaLink(index),
      preserveLeadingSpaces: true,
      preserveTrailingSpaces: true,
    } satisfies ContentText,
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const pngDataUrl = (image: ExportImage) => `data:image/png;base64,${bytesToBase64(image.png)}`;

/// One cell with only a fill and padding, for the boxes around code, quotes and callouts.
const boxLayout = (fill: string, leftBar?: string): CustomTableLayout => ({
  hLineWidth: () => 0,
  vLineWidth: (i) => (leftBar && i === 0 ? 3 : 0),
  vLineColor: () => hex(leftBar ?? fill),
  fillColor: () => hex(fill),
  paddingLeft: () => 9,
  paddingRight: () => 9,
  paddingTop: () => 6,
  paddingBottom: () => 6,
});

const tableLayout = (header: boolean, lines: "rows" | "grid"): CustomTableLayout =>
  lines === "grid"
    ? {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => hex(COLORS.border),
        vLineColor: () => hex(COLORS.border),
        fillColor: (row) => (header && row === 0 ? hex(COLORS.headerFill) : null),
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      }
    : {
        // Lines between the rows only, the way the editor draws these blocks.
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.6),
        vLineWidth: () => 0,
        hLineColor: () => hex(COLORS.border),
        paddingLeft: (i) => (i === 0 ? 0 : 8),
        paddingRight: () => 8,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      };

/// Lays the page out as a pdfmake document, with the inline formulas to draw over it. Pure:
/// the fonts and the PDF bytes come in `pdf-file.ts`, so this stays testable without a
/// renderer.
export function pdfLayout(doc: ExportDocument, options: PageExportOptions): PdfLayout {
  const size = TEXT_SIZES[options.textSize].points;
  const margin = MARGINS[options.margins].points;
  const page = pageDimensions(options);
  const contentWidth = page.width - margin * 2;
  const contentHeight = page.height - margin * 2;
  const formulas: InlineFormula[] = [];
  /// Formula pictures are drawn at `INLINE_MATH_EM_PX` to the em of the body text.
  const pt = size / INLINE_MATH_EM_PX;

  const runs = (items: Run[]): ContentText[] =>
    items.flatMap((run): ContentText[] => {
      if (run.kind === "math") {
        // A formula that could not be drawn is spelled out in text where it can be, and
        // shown as TeX where it can't.
        if (!run.image) return mathRuns(latexToText(run.latex) ?? run.latex);
        const depth = (run.image.depth ?? 0) * pt;
        const room = formulaRoom(
          {
            image: run.image,
            width: run.image.width * pt,
            ascent: run.image.height * pt - depth,
            depth,
          },
          size,
          formulas.length,
        );
        formulas.push(room.formula);
        return [room.run];
      }
      return [
        {
          text: run.text,
          bold: run.bold,
          italics: run.italic,
          ...(run.code && {
            font: PDF_FONTS.mono,
            fontSize: size * CODE_SCALE,
            background: hex(COLORS.codeFill),
          }),
          ...(run.highlight && { background: hex(HIGHLIGHT_FILLS[run.highlight]) }),
          ...(run.color && { color: hex(TEXT_COLOR_FILLS[run.color]) }),
          ...(run.link && { link: run.link, color: hex(COLORS.link) }),
          ...(run.muted && { color: hex(COLORS.muted) }),
        },
      ];
    });

  /// Keeps an empty paragraph one line tall, the way the editor shows it.
  const paragraph = (items: Run[], extra: Partial<ContentText> = {}): ContentText => ({
    text: items.length > 0 ? runs(items) : " ",
    ...extra,
  });

  const box = (body: PdfCell, layout: CustomTableLayout): Content => ({
    table: { widths: ["*"], body: [[body]], dontBreakRows: false },
    layout,
    margin: [0, 2, 0, size * 0.7],
  });

  const checkbox = (checked: boolean): Content => {
    const side = size * 0.8;
    const top = size * 0.3;
    const strokes: CanvasElement[] = [
      {
        type: "rect",
        x: 0,
        y: top,
        w: side,
        h: side,
        r: 2,
        lineWidth: 0.8,
        lineColor: hex(COLORS.muted),
        ...(checked && { color: hex(COLORS.bar) }),
      },
    ];
    if (checked) {
      strokes.push({
        type: "polyline",
        lineWidth: 1.2,
        lineColor: "#FFFFFF",
        points: [
          { x: side * 0.22, y: top + side * 0.52 },
          { x: side * 0.42, y: top + side * 0.72 },
          { x: side * 0.78, y: top + side * 0.3 },
        ],
      });
    }
    return { canvas: strokes };
  };

  const listItems = (items: ListItem[]): Content[] =>
    items.map((item) => {
      const marker: Content =
        item.checked !== undefined
          ? checkbox(item.checked)
          : { text: item.marker, color: hex(COLORS.muted), alignment: "right" };
      const markerWidth = item.marker === "" && item.checked === undefined ? 0 : size * 1.6;
      return {
        columns: [
          { width: markerWidth, stack: [marker] },
          {
            width: "*",
            stack: [
              paragraph(
                item.runs,
                item.checked ? { color: hex(COLORS.muted), decoration: "lineThrough" } : {},
              ),
              ...(item.children.length > 0 ? listItems(item.children) : []),
            ],
          },
        ],
        columnGap: size * 0.5,
        margin: [0, 0, 0, size * 0.2],
      };
    });

  const bar = (share: number): Content => {
    const width = size * 6;
    const height = size * 0.45;
    return {
      canvas: [
        {
          type: "rect",
          x: 0,
          y: 0,
          w: width,
          h: height,
          r: height / 2,
          color: hex(COLORS.barFill),
        },
        ...(share > 0
          ? [
              {
                type: "rect" as const,
                x: 0,
                y: 0,
                w: Math.max(height, width * share),
                h: height,
                r: height / 2,
                color: hex(COLORS.bar),
              },
            ]
          : []),
      ],
      margin: [0, size * 0.3, 0, 0],
    };
  };

  const tableCell = (cell: TableCell, header: boolean): PdfCell =>
    cell.bar === undefined
      ? paragraph(cell.runs, header ? { bold: true } : {})
      : { stack: [paragraph(cell.runs), bar(cell.bar)] };

  const block = (item: ExportBlock): Content => {
    switch (item.kind) {
      case "heading":
        return paragraph(item.runs, {
          fontSize: size * HEADING_SCALE[item.level],
          bold: true,
          color: item.level === 6 ? hex(COLORS.muted) : undefined,
          margin: [0, size * (item.level <= 2 ? 1.1 : 0.8), 0, size * 0.4],
          headlineLevel: item.level,
        });
      case "paragraph":
        return paragraph(item.runs, { alignment: item.align, margin: [0, 0, 0, size * 0.6] });
      case "caption-title":
        return { text: item.text, bold: true, margin: [0, size * 0.3, 0, size * 0.3] };
      case "list":
        return { stack: listItems(item.items), margin: [0, 0, 0, size * 0.5] };
      case "code": {
        const label: ContentText[] = item.label
          ? [
              {
                text: item.label,
                color: hex(COLORS.muted),
                fontSize: size * CAPTION_SCALE,
                margin: [0, 0, 0, 4],
              },
            ]
          : [];
        return box(
          {
            stack: [
              ...label,
              {
                text: item.text || " ",
                font: PDF_FONTS.mono,
                fontSize: size * CODE_SCALE,
                preserveLeadingSpaces: true,
                lineHeight: LINE_HEIGHT,
              },
            ],
          },
          boxLayout(COLORS.codeFill),
        );
      }
      case "quote":
        return box(
          paragraph(item.runs, { color: hex(COLORS.muted) }),
          boxLayout("FFFFFF", COLORS.quoteBar),
        );
      case "callout": {
        const tone = CALLOUTS[item.tone];
        return box(
          {
            text: [
              { text: `${tone.label}  `, bold: true, color: hex(tone.accent) },
              ...runs(item.runs),
            ],
          },
          boxLayout(tone.fill, tone.accent),
        );
      }
      case "table": {
        const columns = Math.max(1, ...item.rows.map((row) => row.length));
        return {
          table: {
            headerRows: item.header ? 1 : 0,
            widths: Array.from({ length: columns }, (_, i) =>
              item.columns?.[i] === "fit" ? "auto" : "*",
            ),
            body: item.rows.map((row, rowIndex) =>
              Array.from({ length: columns }, (_, i) => {
                const cell = row[i];
                return cell ? tableCell(cell, item.header && rowIndex === 0) : "";
              }),
            ),
          },
          layout: tableLayout(item.header, item.lines ?? "grid"),
          margin: [0, 2, 0, size * 0.8],
        };
      }
      case "rule":
        return {
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 0,
              x2: contentWidth,
              y2: 0,
              lineWidth: 0.6,
              lineColor: hex(COLORS.border),
            },
          ],
          margin: [0, size * 0.6, 0, size * 1.1],
        };
      case "figure": {
        const caption: Content[] = item.caption
          ? [
              {
                text: item.caption,
                alignment: "center",
                color: hex(COLORS.muted),
                fontSize: size * CAPTION_SCALE,
                margin: [0, 4, 0, 0],
              },
            ]
          : [];
        if (!item.image) {
          return {
            stack: [
              box(
                {
                  text: item.fallback,
                  font: PDF_FONTS.mono,
                  fontSize: size * CODE_SCALE,
                  preserveLeadingSpaces: true,
                },
                boxLayout(COLORS.codeFill),
              ),
              ...caption,
            ],
          };
        }
        const fit = fitImage(item.image, contentWidth, contentHeight * 0.8);
        return {
          stack: [
            {
              image: pngDataUrl(item.image),
              width: fit.width,
              height: fit.height,
              alignment: "center",
            },
            ...caption,
          ],
          margin: [0, size * 0.4, 0, size * 0.9],
          unbreakable: true,
        };
      }
    }
  };

  const title: Content[] = options.includeTitle
    ? [{ text: doc.title, fontSize: size * TITLE_SCALE, bold: true, margin: [0, 0, 0, size * 0.9] }]
    : [];

  const definition: TDocumentDefinitions = {
    info: { title: doc.title, creator: "Nookly" },
    pageSize: { width: page.width, height: page.height },
    pageMargins: margin,
    defaultStyle: {
      font: PDF_FONTS.body,
      fontSize: size,
      lineHeight: LINE_HEIGHT,
      color: hex(COLORS.text),
    },
    // A heading never ends a page: it moves to the next one with the text it heads.
    pageBreakBefore: (node, following) =>
      node.headlineLevel !== undefined && following.getFollowingNodesOnPage().length === 0,
    content: [...title, ...doc.blocks.map(block)],
  };
  return { definition, formulas };
}
