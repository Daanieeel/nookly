import JSZip from "jszip";
import type {
  ExportBlock,
  ExportDocument,
  ExportImage,
  ListItem,
  Run,
  TableCell,
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
  TEXT_COLOR_FILLS,
  INLINE_MATH_EM_PX,
  PX_TO_PT,
  TITLE_SCALE,
  columnWidths,
  fitImage,
} from "./print-style.ts";

const MIMETYPE = "application/vnd.oasis.opendocument.text";

const NAMESPACES = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'office:version="1.3"',
].join(" ");

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

/// Control characters other than tab and line breaks are not allowed in XML at all.
const allowedInXml = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
};

export function escapeXml(value: string): string {
  return [...value]
    .filter(allowedInXml)
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/// Text as OpenDocument writes it: runs of spaces, tabs and line breaks are elements, since
/// plain whitespace collapses to one space.
export function odfText(value: string): string {
  return value
    .split("\n")
    .map((line) =>
      line
        .split("\t")
        .map((part) =>
          escapeXml(part).replace(/^ +| {2,}/g, (spaces, offset: number) =>
            offset === 0
              ? `<text:s text:c="${spaces.length}"/>`
              : ` <text:s text:c="${spaces.length - 1}"/>`,
          ),
        )
        .join("<text:tab/>"),
    )
    .join("<text:line-break/>");
}

const pt = (points: number) => `${Math.round(points * 100) / 100}pt`;
const hex = (color: string) => `#${color}`;

export interface OdtFiles {
  content: string;
  styles: string;
  meta: string;
  manifest: string;
  pictures: Map<string, Uint8Array>;
}

/// Lays the page out as an OpenDocument text file's parts. Pure: `odtBytes` zips them.
export function odtFiles(doc: ExportDocument, options: PageExportOptions): OdtFiles {
  const size = TEXT_SIZES[options.textSize].points;
  const margin = MARGINS[options.margins].points;
  const page = pageDimensions(options);
  const contentWidth = page.width - margin * 2;
  const contentHeight = page.height - margin * 2;
  const pictures = new Map<string, Uint8Array>();

  // Automatic styles are made as the content needs them, one per distinct look.
  const automatic = new Map<string, { name: string; xml: string }>();
  const autoStyle = (
    family: "text" | "paragraph" | "table" | "table-column" | "table-cell",
    props: string,
    parent?: string,
  ) => {
    const key = `${family}|${parent ?? ""}|${props}`;
    const existing = automatic.get(key);
    if (existing) return existing.name;
    const name = `${family.replace("table-", "").slice(0, 2).toUpperCase()}${automatic.size + 1}`;
    const parentAttr = parent ? ` style:parent-style-name="${parent}"` : "";
    automatic.set(key, {
      name,
      xml: `<style:style style:name="${name}" style:family="${family}"${parentAttr}>${props}</style:style>`,
    });
    return name;
  };

  const picture = (image: ExportImage, width: number, height: number, alt: string) => {
    const name = `Pictures/image${pictures.size + 1}.png`;
    pictures.set(name, image.png);
    return `<draw:frame draw:name="Image${pictures.size}" text:anchor-type="as-char" svg:width="${pt(width)}" svg:height="${pt(height)}" draw:z-index="0"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><svg:desc>${escapeXml(alt)}</svg:desc></draw:frame>`;
  };

  const span = (text: string, props: string[]) =>
    props.length === 0
      ? odfText(text)
      : `<text:span text:style-name="${autoStyle("text", `<style:text-properties ${props.join(" ")}/>`)}">${odfText(text)}</text:span>`;

  const runs = (items: Run[], base: string[] = []): string =>
    items
      .map((run) => {
        if (run.kind === "math") {
          if (!run.image)
            return span(run.latex, [
              ...base,
              'fo:font-style="italic"',
              `style:font-name="${FONTS.mono}"`,
            ]);
          const scale = (size / PX_TO_PT / INLINE_MATH_EM_PX) * PX_TO_PT;
          return picture(run.image, run.image.width * scale, run.image.height * scale, run.latex);
        }
        const props = [...base];
        if (run.bold) props.push('fo:font-weight="bold"');
        if (run.italic) props.push('fo:font-style="italic"');
        if (run.code)
          props.push(
            `style:font-name="${FONTS.mono}"`,
            `fo:font-size="${pt(size * CODE_SCALE)}"`,
            `fo:background-color="${hex(COLORS.codeFill)}"`,
          );
        if (run.highlight)
          props.push(`fo:background-color="${hex(HIGHLIGHT_FILLS[run.highlight])}"`);
        // One `fo:color` only: a hint's or a link's own colour wins.
        if (run.color && !run.muted && !run.link && !props.some((p) => p.startsWith("fo:color=")))
          props.push(`fo:color="${hex(TEXT_COLOR_FILLS[run.color])}"`);
        if (run.muted) props.push(`fo:color="${hex(COLORS.muted)}"`);
        if (run.link) {
          props.push(
            `fo:color="${hex(COLORS.link)}"`,
            'style:text-underline-style="solid"',
            'style:text-underline-width="auto"',
            'style:text-underline-color="font-color"',
          );
          return `<text:a xlink:type="simple" xlink:href="${escapeXml(run.link)}">${span(run.text, props)}</text:a>`;
        }
        return span(run.text, props);
      })
      .join("");

  const p = (style: string, body: string) => `<text:p text:style-name="${style}">${body}</text:p>`;

  const listParagraphs = (items: ListItem[], depth: number): string =>
    items
      .map((item) => {
        const indent = size * 1.8;
        const marker = item.checked === undefined ? item.marker : item.checked ? "☒" : "☐";
        const style = autoStyle(
          "paragraph",
          `<style:paragraph-properties fo:margin-left="${pt(indent * (depth + 1))}" fo:text-indent="${pt(marker ? -indent : 0)}" fo:margin-bottom="${pt(size * 0.2)}"><style:tab-stops><style:tab-stop style:position="0pt"/></style:tab-stops></style:paragraph-properties>`,
          "Body",
        );
        const head = marker
          ? `${span(marker, [`fo:color="${hex(COLORS.muted)}"`])}<text:tab/>`
          : "";
        const done = item.checked
          ? ['style:text-line-through-style="solid"', `fo:color="${hex(COLORS.muted)}"`]
          : [];
        return p(style, head + runs(item.runs, done)) + listParagraphs(item.children, depth + 1);
      })
      .join("");

  let tables = 0;
  const table = (item: Extract<ExportBlock, { kind: "table" }>) => {
    const { rows, header } = item;
    const columns = Math.max(1, ...rows.map((row) => row.length));
    const widths = columnWidths(rows, item.columns, columns, contentWidth, size);
    const tableStyle = autoStyle(
      "table",
      `<style:table-properties style:width="${pt(contentWidth)}" table:align="margins" fo:margin-bottom="${pt(size * 0.8)}"/>`,
    );
    const line = `0.5pt solid ${hex(COLORS.border)}`;
    const cellStyle = (head: boolean, first: boolean) =>
      autoStyle(
        "table-cell",
        `<style:table-cell-properties ${
          item.lines === "rows"
            ? `fo:border="none" fo:border-top="${first ? "none" : line}"`
            : `fo:border="${line}"`
        } fo:padding-left="6pt" fo:padding-right="6pt" fo:padding-top="3pt" fo:padding-bottom="3pt"${head ? ` fo:background-color="${hex(COLORS.headerFill)}"` : ""}/>`,
      );
    const row = (cells: TableCell[], index: number) => {
      const head = header && index === 0;
      return `<table:table-row>${Array.from({ length: columns }, (_, i) => {
        const cell = cells[i];
        return `<table:table-cell table:style-name="${cellStyle(head, index === 0)}" office:value-type="string">${p("Table_20_Contents", runs(cell?.runs ?? [], head ? ['fo:font-weight="bold"'] : []))}</table:table-cell>`;
      }).join("")}</table:table-row>`;
    };
    const columnTags = widths
      .map(
        (width) =>
          `<table:table-column table:style-name="${autoStyle("table-column", `<style:table-column-properties style:column-width="${pt(width)}"/>`)}"/>`,
      )
      .join("");
    const [first = [], ...rest] = rows;
    tables += 1;
    return `<table:table table:name="Table${tables}" table:style-name="${tableStyle}">${columnTags}${
      header
        ? `<table:table-header-rows>${row(first, 0)}</table:table-header-rows>${rest.map((r, i) => row(r, i + 1)).join("")}`
        : rows.map(row).join("")
    }</table:table>`;
  };

  const boxStyle = (fill: string, leftBar?: string) =>
    autoStyle(
      "paragraph",
      `<style:paragraph-properties fo:background-color="${hex(fill)}" fo:padding="6pt" fo:padding-left="9pt" fo:margin-bottom="${pt(size * 0.7)}"${leftBar ? ` fo:border-left="2.25pt solid ${hex(leftBar)}" fo:border-right="none" fo:border-top="none" fo:border-bottom="none"` : ' fo:border="none"'}/>`,
      "Body",
    );

  const code = (text: string, label?: string) =>
    (label ? p("Code_20_Label", odfText(label)) : "") +
    p(
      boxStyle(COLORS.codeFill),
      span(text || " ", [
        `style:font-name="${FONTS.mono}"`,
        `fo:font-size="${pt(size * CODE_SCALE)}"`,
      ]),
    );

  const block = (item: ExportBlock): string => {
    switch (item.kind) {
      case "heading":
        return `<text:h text:style-name="Heading_20_${item.level}" text:outline-level="${item.level}">${runs(item.runs)}</text:h>`;
      case "paragraph":
        return p(item.align === "center" ? "Figure" : "Body", runs(item.runs));
      case "caption-title":
        return p("Block_20_Title", odfText(item.text));
      case "list":
        return listParagraphs(item.items, 0);
      case "code":
        return code(item.text, item.label);
      case "quote":
        return p(
          boxStyle("FFFFFF", COLORS.quoteBar),
          runs(item.runs, [`fo:color="${hex(COLORS.muted)}"`]),
        );
      case "callout": {
        const tone = CALLOUTS[item.tone];
        return p(
          boxStyle(tone.fill, tone.accent),
          span(`${tone.label}  `, ['fo:font-weight="bold"', `fo:color="${hex(tone.accent)}"`]) +
            runs(item.runs),
        );
      }
      case "table":
        return table(item);
      case "rule":
        return p("Rule", "");
      case "figure": {
        const caption = item.caption ? p("Caption", odfText(item.caption)) : "";
        if (!item.image) return code(item.fallback) + caption;
        const fit = fitImage(item.image, contentWidth, contentHeight * 0.8);
        return p("Figure", picture(item.image, fit.width, fit.height, item.fallback)) + caption;
      }
    }
  };

  const body = [
    ...(options.includeTitle ? [p("Title", odfText(doc.title))] : []),
    ...doc.blocks.map(block),
  ].join("");

  const fontDecls = `<office:font-face-decls><style:font-face style:name="${FONTS.body}" svg:font-family="${FONTS.body}" style:font-family-generic="swiss"/><style:font-face style:name="${FONTS.mono}" svg:font-family="'${FONTS.mono}'" style:font-family-generic="modern" style:font-pitch="fixed"/></office:font-face-decls>`;

  const content = `${XML_HEAD}<office:document-content ${NAMESPACES}>${fontDecls}<office:automatic-styles>${[...automatic.values()].map((style) => style.xml).join("")}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;

  const heading = (level: 1 | 2 | 3 | 4 | 5 | 6) =>
    `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Body" style:default-outline-level="${level}" style:class="text"><style:paragraph-properties fo:margin-top="${pt(size * (level <= 2 ? 1.1 : 0.8))}"/><style:text-properties fo:font-size="${pt(size * HEADING_SCALE[level])}"${level === 6 ? ` fo:color="${hex(COLORS.muted)}"` : ""}/></style:style>`;

  const styles = `${XML_HEAD}<office:document-styles ${NAMESPACES}>${fontDecls}<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="130%"/><style:text-properties style:font-name="${FONTS.body}" fo:font-size="${pt(size)}" fo:color="${hex(COLORS.text)}"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Body" style:display-name="Body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0pt" fo:margin-bottom="${pt(size * 0.6)}"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Body" style:class="text"><style:paragraph-properties fo:margin-bottom="${pt(size * 0.4)}" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold"/></style:style>
${([1, 2, 3, 4, 5, 6] as const).map(heading).join("")}
<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Body" style:class="chapter"><style:paragraph-properties fo:margin-top="0pt" fo:margin-bottom="${pt(size * 0.9)}"/><style:text-properties fo:font-size="${pt(size * TITLE_SCALE)}"/></style:style>
<style:style style:name="Block_20_Title" style:display-name="Block Title" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:margin-top="${pt(size * 0.3)}" fo:margin-bottom="${pt(size * 0.3)}" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Body" style:class="extra"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="${pt(size * 0.9)}"/><style:text-properties fo:font-size="${pt(size * CAPTION_SCALE)}" fo:color="${hex(COLORS.muted)}"/></style:style>
<style:style style:name="Code_20_Label" style:display-name="Code Label" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:margin-bottom="${pt(size * 0.2)}" fo:keep-with-next="always"/><style:text-properties fo:font-size="${pt(size * CAPTION_SCALE)}" fo:color="${hex(COLORS.muted)}"/></style:style>
<style:style style:name="Figure" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"/>
<style:style style:name="Rule" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="${pt(size * 0.6)}" fo:margin-bottom="${pt(size * 1.1)}" fo:border-bottom="0.75pt solid ${hex(COLORS.border)}" fo:padding="0pt"/><style:text-properties fo:font-size="2pt"/></style:style>
</office:styles><office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="${pt(page.width)}" fo:page-height="${pt(page.height)}" style:print-orientation="${options.landscape ? "landscape" : "portrait"}" fo:margin-top="${pt(margin)}" fo:margin-bottom="${pt(margin)}" fo:margin-left="${pt(margin)}" fo:margin-right="${pt(margin)}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles></office:document-styles>`;

  const meta = `${XML_HEAD}<office:document-meta ${NAMESPACES}><office:meta><meta:generator>Nookly</meta:generator><dc:title>${escapeXml(doc.title)}</dc:title></office:meta></office:document-meta>`;

  const manifest = `${XML_HEAD}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIMETYPE}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${[...pictures.keys()].map((name) => `<manifest:file-entry manifest:full-path="${name}" manifest:media-type="image/png"/>`).join("")}</manifest:manifest>`;

  return { content, styles, meta, manifest, pictures };
}

export async function odtBytes(
  doc: ExportDocument,
  options: PageExportOptions,
): Promise<Uint8Array> {
  const files = odtFiles(doc, options);
  const zip = new JSZip();
  // The mimetype comes first and uncompressed, so a reader can tell the file type from its
  // first bytes.
  zip.file("mimetype", MIMETYPE, { compression: "STORE" });
  zip.file("META-INF/manifest.xml", files.manifest);
  zip.file("content.xml", files.content);
  zip.file("styles.xml", files.styles);
  zip.file("meta.xml", files.meta);
  for (const [name, png] of files.pictures) zip.file(name, png);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: MIMETYPE,
  });
}
