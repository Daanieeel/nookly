import { z } from "zod";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

export const FORMAT_IDS = ["pdf", "docx", "odt", "markdown"] as const;
export type ExportFormat = (typeof FORMAT_IDS)[number];

export const PAGE_SIZE_IDS = ["a4", "letter", "legal", "a3", "a5"] as const;
export type PageSizeId = (typeof PAGE_SIZE_IDS)[number];

export const MARGIN_IDS = ["normal", "narrow", "none"] as const;
export type MarginsId = (typeof MARGIN_IDS)[number];

export const TEXT_SIZE_IDS = ["small", "medium", "large"] as const;
export type TextSizeId = (typeof TEXT_SIZE_IDS)[number];

/// What the Export dialog sets. Remembered per device, so the next export starts the same.
export interface PageExportOptions {
  format: ExportFormat;
  /// The page's title as a heading above its content.
  includeTitle: boolean;
  pageSize: PageSizeId;
  landscape: boolean;
  margins: MarginsId;
  textSize: TextSizeId;
}

interface Labeled {
  label: string;
}

/// A width and height in points.
export interface Size {
  width: number;
  height: number;
}

/// Paper sizes in points (1/72 inch), portrait.
export const PAGE_SIZES = {
  a4: { label: "A4", width: 595.28, height: 841.89 },
  letter: { label: "Letter", width: 612, height: 792 },
  legal: { label: "Legal", width: 612, height: 1008 },
  a3: { label: "A3", width: 841.89, height: 1190.55 },
  a5: { label: "A5", width: 419.53, height: 595.28 },
} satisfies Record<PageSizeId, Labeled & Size>;

/// Margins on every side, in points.
export const MARGINS = {
  normal: { label: "Normal", points: 56.7 },
  narrow: { label: "Narrow", points: 28.35 },
  none: { label: "None", points: 0 },
} satisfies Record<MarginsId, Labeled & { points: number }>;

/// The body text size in points; headings scale with it.
export const TEXT_SIZES = {
  small: { label: "Small", points: 9.5 },
  medium: { label: "Medium", points: 11 },
  large: { label: "Large", points: 13 },
} satisfies Record<TextSizeId, Labeled & { points: number }>;

export const FORMATS = {
  pdf: { label: "PDF", extension: "pdf", filter: "PDF" },
  docx: { label: "Word", extension: "docx", filter: "Word document" },
  odt: { label: "OpenDocument", extension: "odt", filter: "OpenDocument text" },
  markdown: { label: "Markdown", extension: "md", filter: "Markdown" },
} satisfies Record<ExportFormat, Labeled & { extension: string; filter: string }>;

/// A4 for everyone; the dialog still offers Letter and the others.
export function defaultOptions(): PageExportOptions {
  return {
    format: "pdf",
    includeTitle: true,
    pageSize: "a4",
    landscape: false,
    margins: "normal",
    textSize: "medium",
  };
}

/// Each remembered option on its own: one that is missing or no longer known falls back to
/// its default, so a value from another version never breaks the dialog.
function optionsSchema(defaults: PageExportOptions) {
  return z
    .object({
      format: z.enum(FORMAT_IDS).catch(defaults.format),
      includeTitle: z.boolean().catch(defaults.includeTitle),
      pageSize: z.enum(PAGE_SIZE_IDS).catch(defaults.pageSize),
      landscape: z.boolean().catch(defaults.landscape),
      margins: z.enum(MARGIN_IDS).catch(defaults.margins),
      textSize: z.enum(TEXT_SIZE_IDS).catch(defaults.textSize),
    })
    .catch(defaults);
}

/// The saved JSON, or null for nothing saved or a value that is not JSON; the schema makes
/// either one the defaults.
function readSaved(raw: string | null) {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadOptions(): PageExportOptions {
  return optionsSchema(defaultOptions()).parse(readSaved(preferences.get(STORAGE_KEYS.pageExport)));
}

export function saveOptions(options: PageExportOptions) {
  preferences.set(STORAGE_KEYS.pageExport, JSON.stringify(options));
}

/// The page's width and height in points, turned for landscape.
export function pageDimensions(options: PageExportOptions): Size {
  const { width, height } = PAGE_SIZES[options.pageSize];
  return options.landscape ? { width: height, height: width } : { width, height };
}
