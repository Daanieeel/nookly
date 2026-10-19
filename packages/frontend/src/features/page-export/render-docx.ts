import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  type ParagraphChild,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type {
  ExportBlock,
  ExportDocument,
  ExportImage,
  ListItem,
  Run,
  TableCell as ModelCell,
} from "./document-model.ts";
import { type PageExportOptions, MARGINS, TEXT_SIZES, pageDimensions } from "./export-options.ts";
import {
  CALLOUTS,
  CAPTION_SCALE,
  CODE_SCALE,
  COLORS,
  FONTS,
  HEADING_SCALE,
  HIGHLIGHT_FILLS,
  INLINE_MATH_EM_PX,
  PX_TO_PT,
  TITLE_SCALE,
  columnWidths,
  fitImage,
} from "./print-style.ts";

/// Word measures pages in twentieths of a point, text in half points and images in pixels.
const twips = (points: number) => Math.round(points * 20);
const halfPoints = (points: number) => Math.round(points * 2);
const pixels = (points: number) => Math.round(points / PX_TO_PT);

const HEADINGS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const thin = (color: string) => ({ style: BorderStyle.SINGLE, size: 4, color });

type RunStyle = ConstructorParameters<typeof TextRun>[0] & object;

/// Lays the page out as a Word document. Pure: `Packer` turns it into bytes in `docxBytes`.
export function docxDocument(doc: ExportDocument, options: PageExportOptions): Document {
  const size = TEXT_SIZES[options.textSize].points;
  const margin = MARGINS[options.margins].points;
  const page = pageDimensions(options);
  const contentWidth = page.width - margin * 2;
  const contentHeight = page.height - margin * 2;
  const after = (factor: number) => ({ after: twips(size * factor) });

  /// Text with its line breaks kept as breaks.
  const textRuns = (value: string, style: Omit<RunStyle, "text" | "break"> = {}): TextRun[] =>
    value
      .split("\n")
      .map((line, i) => new TextRun({ ...style, text: line, break: i > 0 ? 1 : undefined }));

  const runs = (items: Run[], base: Omit<RunStyle, "text"> = {}): ParagraphChild[] =>
    items.flatMap((run): ParagraphChild[] => {
      if (run.kind === "math") {
        if (!run.image) return textRuns(run.latex, { ...base, italics: true, font: FONTS.mono });
        const scale = size / PX_TO_PT / INLINE_MATH_EM_PX;
        return [
          new ImageRun({
            type: "png",
            data: run.image.png,
            transformation: { width: run.image.width * scale, height: run.image.height * scale },
            altText: { name: "Formula", description: run.latex },
          }),
        ];
      }
      const style: Omit<RunStyle, "text"> = {
        ...base,
        bold: run.bold || base.bold,
        italics: run.italic || base.italics,
        ...(run.code && {
          font: FONTS.mono,
          size: halfPoints(size * CODE_SCALE),
          shading: { type: ShadingType.CLEAR, fill: COLORS.codeFill, color: "auto" },
        }),
        ...(run.highlight && {
          shading: { type: ShadingType.CLEAR, fill: HIGHLIGHT_FILLS[run.highlight], color: "auto" },
        }),
        ...(run.muted && { color: COLORS.muted }),
      };
      if (!run.link) return textRuns(run.text, style);
      return [
        new ExternalHyperlink({
          link: run.link,
          children: textRuns(run.text, { ...style, color: COLORS.link, underline: {} }),
        }),
      ];
    });

  const image = (picture: ExportImage, maxWidth: number, maxHeight: number, alt: string) => {
    const fit = fitImage(picture, maxWidth, maxHeight);
    return new ImageRun({
      type: "png",
      data: picture.png,
      transformation: { width: pixels(fit.width), height: pixels(fit.height) },
      altText: { name: alt, description: alt },
    });
  };

  /// One cell holding `children`, filled and padded: the box around code and callouts.
  const box = (children: Paragraph[], fill: string, leftBar?: string) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children,
              shading: { type: ShadingType.CLEAR, fill, color: "auto" },
              borders: {
                ...NO_BORDERS,
                ...(leftBar && { left: { style: BorderStyle.SINGLE, size: 18, color: leftBar } }),
              },
              margins: { top: twips(5), bottom: twips(5), left: twips(9), right: twips(9) },
            }),
          ],
        }),
      ],
    });

  /// Space below a table, which Word cannot set on the table itself.
  const spacer = () =>
    new Paragraph({ spacing: { after: 0, line: twips(size * 0.6) }, children: [] });

  const codeParagraphs = (code: string, label?: string) => [
    ...(label
      ? [
          new Paragraph({
            spacing: after(0.3),
            children: textRuns(label, {
              color: COLORS.muted,
              size: halfPoints(size * CAPTION_SCALE),
            }),
          }),
        ]
      : []),
    new Paragraph({
      children: textRuns(code || " ", { font: FONTS.mono, size: halfPoints(size * CODE_SCALE) }),
    }),
  ];

  const listParagraphs = (items: ListItem[], depth: number): Paragraph[] =>
    items.flatMap((item) => {
      const indent = twips(size * 1.8);
      const marker = item.checked === undefined ? item.marker : item.checked ? "☒" : "☐";
      const itemRuns = item.checked
        ? item.runs.map((run) => (run.kind === "text" ? { ...run, muted: true } : run))
        : item.runs;
      return [
        new Paragraph({
          indent: { left: indent * (depth + 1), hanging: marker ? indent : 0 },
          spacing: after(0.2),
          children: [
            ...(marker
              ? [
                  new TextRun({ text: marker, color: COLORS.muted }),
                  new TextRun({ children: [new Tab()] }),
                ]
              : []),
            ...runs(itemRuns, item.checked ? { strike: true } : {}),
          ],
        }),
        ...listParagraphs(item.children, depth + 1),
      ];
    });

  const tableCell = (cell: ModelCell, header: boolean, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      children: [new Paragraph({ children: runs(cell.runs, header ? { bold: true } : {}) })],
      ...(header && {
        shading: { type: ShadingType.CLEAR, fill: COLORS.headerFill, color: "auto" },
      }),
      margins: { top: twips(3), bottom: twips(3), left: twips(6), right: twips(6) },
    });

  const block = (item: ExportBlock): (Paragraph | Table)[] => {
    switch (item.kind) {
      case "heading":
        return [new Paragraph({ heading: HEADINGS[item.level], children: runs(item.runs) })];
      case "paragraph":
        return [
          new Paragraph({
            alignment: item.align === "center" ? AlignmentType.CENTER : undefined,
            spacing: after(0.6),
            children: runs(item.runs),
          }),
        ];
      case "caption-title":
        return [
          new Paragraph({
            spacing: { before: twips(size * 0.3), after: twips(size * 0.3) },
            keepNext: true,
            children: textRuns(item.text, { bold: true }),
          }),
        ];
      case "list":
        return [...listParagraphs(item.items, 0), spacer()];
      case "code":
        return [box(codeParagraphs(item.text, item.label), COLORS.codeFill), spacer()];
      case "quote":
        return [
          new Paragraph({
            indent: { left: twips(9) },
            border: {
              left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.quoteBar, space: 8 },
            },
            spacing: after(0.6),
            children: runs(item.runs, { color: COLORS.muted }),
          }),
        ];
      case "callout": {
        const tone = CALLOUTS[item.tone];
        return [
          box(
            [
              new Paragraph({
                children: [
                  new TextRun({ text: `${tone.label}  `, bold: true, color: tone.accent }),
                  ...runs(item.runs),
                ],
              }),
            ],
            tone.fill,
            tone.accent,
          ),
          spacer(),
        ];
      }
      case "table": {
        const columns = Math.max(1, ...item.rows.map((row) => row.length));
        const widths = columnWidths(item.rows, item.columns, columns, contentWidth, size).map(
          twips,
        );
        const border = thin(COLORS.border);
        const borders =
          item.lines === "rows"
            ? { ...NO_BORDERS, insideVertical: NO_BORDER, insideHorizontal: border }
            : {
                top: border,
                bottom: border,
                left: border,
                right: border,
                insideHorizontal: border,
                insideVertical: border,
              };
        return [
          new Table({
            width: { size: twips(contentWidth), type: WidthType.DXA },
            columnWidths: widths,
            borders,
            rows: item.rows.map(
              (row, rowIndex) =>
                new TableRow({
                  tableHeader: item.header && rowIndex === 0,
                  children: Array.from({ length: columns }, (_, i) =>
                    tableCell(
                      row[i] ?? { runs: [] },
                      item.header && rowIndex === 0,
                      widths[i] ?? 0,
                    ),
                  ),
                }),
            ),
          }),
          spacer(),
        ];
      }
      case "rule":
        return [
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border, space: 1 },
            },
            spacing: after(1),
            children: [],
          }),
        ];
      case "figure": {
        const caption = item.caption
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: after(0.9),
                children: textRuns(item.caption, {
                  color: COLORS.muted,
                  size: halfPoints(size * CAPTION_SCALE),
                }),
              }),
            ]
          : [];
        if (!item.image)
          return [
            box(codeParagraphs(item.fallback), COLORS.codeFill),
            ...(caption.length > 0 ? caption : [spacer()]),
          ];
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: caption.length > 0,
            spacing: item.caption ? after(0.2) : after(0.9),
            children: [image(item.image, contentWidth, contentHeight * 0.8, item.fallback)],
          }),
          ...caption,
        ];
      }
    }
  };

  const heading = (scale: number, spaceBefore: number) => ({
    run: { size: halfPoints(size * scale), bold: true, color: COLORS.text, font: FONTS.body },
    paragraph: {
      spacing: { before: twips(size * spaceBefore), after: twips(size * 0.4) },
      keepNext: true,
    },
  });

  return new Document({
    title: doc.title,
    creator: "Nookly",
    styles: {
      default: {
        document: {
          run: { font: FONTS.body, size: halfPoints(size), color: COLORS.text },
          paragraph: { spacing: { line: 312 } },
        },
        title: heading(TITLE_SCALE, 0),
        heading1: heading(HEADING_SCALE[1], 1.1),
        heading2: heading(HEADING_SCALE[2], 1.1),
        heading3: heading(HEADING_SCALE[3], 0.8),
        heading4: heading(HEADING_SCALE[4], 0.8),
        heading5: heading(HEADING_SCALE[5], 0.8),
        heading6: {
          ...heading(HEADING_SCALE[6], 0.8),
          run: { ...heading(HEADING_SCALE[6], 0.8).run, color: COLORS.muted },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              // Word takes the portrait size and turns it itself.
              width: twips(options.landscape ? page.height : page.width),
              height: twips(options.landscape ? page.width : page.height),
              orientation: options.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: twips(margin),
              bottom: twips(margin),
              left: twips(margin),
              right: twips(margin),
            },
          },
        },
        children: [
          ...(options.includeTitle
            ? [
                new Paragraph({
                  heading: HeadingLevel.TITLE,
                  spacing: after(0.9),
                  children: textRuns(doc.title),
                }),
              ]
            : []),
          ...doc.blocks.flatMap(block),
        ],
      },
    ],
  });
}

export async function docxBytes(
  doc: ExportDocument,
  options: PageExportOptions,
): Promise<Uint8Array> {
  const blob = await Packer.toBlob(docxDocument(doc, options));
  return new Uint8Array(await blob.arrayBuffer());
}
