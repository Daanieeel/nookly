import { save } from "@tauri-apps/plugin-dialog";
import { fileBaseName, savePageMarkdownFile } from "#/features/notes/page-file.ts";
import { listBlocks, writePageExport } from "#/lib/api/notes.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import type { ExportDocument } from "./document-model.ts";
import { type ExportFormat, FORMATS, type PageExportOptions } from "./export-options.ts";
import { pageDocument } from "./page-document.ts";
import { type FigureRenderers, resolveDocument } from "./resolve-document.ts";

/// A document format the app renders itself, rather than the backend's markdown.
export type DocumentFormat = Exclude<ExportFormat, "markdown">;

/// The page laid out and its figures drawn, ready for any format.
export async function loadExportDocument(
  entity: Entity,
  renderers?: FigureRenderers,
): Promise<ExportDocument> {
  const blocks = await listBlocks(entity.id);
  const figures = renderers ?? (await import("./figure-renderers.ts")).appFigureRenderers;
  return resolveDocument(pageDocument(displayTitle(entity), blocks), figures);
}

/// The file's bytes. Each writer loads only when its format is used.
export async function renderDocument(
  doc: ExportDocument,
  format: DocumentFormat,
  options: PageExportOptions,
): Promise<Uint8Array> {
  switch (format) {
    case "pdf":
      return (await import("./pdf-file.ts")).pdfBytes(doc, options);
    case "docx":
      return (await import("./render-docx.ts")).docxBytes(doc, options);
    case "odt":
      return (await import("./render-odt.ts")).odtBytes(doc, options);
  }
}

function exportFileName(entity: Entity, format: ExportFormat): string {
  return `${fileBaseName(entity)}.${FORMATS[format].extension}`;
}

/// `path` ending in the format's extension, added when the user typed a name without it.
function withExtension(path: string, format: ExportFormat): string {
  const extension = `.${FORMATS[format].extension}`;
  return path.toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
}

/// Asks where to save and writes the page there. Resolves `false` when the user cancels the
/// save dialog. `load` gives the laid out page, which the dialog already has.
export async function exportPage(
  entity: Entity,
  options: PageExportOptions,
  load: () => Promise<ExportDocument>,
  render = renderDocument,
): Promise<boolean> {
  if (options.format === "markdown") return savePageMarkdownFile(entity);
  const format = FORMATS[options.format];
  const path = await save({
    defaultPath: exportFileName(entity, options.format),
    filters: [{ name: format.filter, extensions: [format.extension] }],
  });
  if (!path) return false;
  const bytes = await render(await load(), options.format, options);
  await writePageExport(withExtension(path, options.format), bytes);
  return true;
}
