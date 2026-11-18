import { livePath } from "../data/reroot.ts";
import {
  type FileKindId,
  type FileRecord,
  fileKindOf,
  isDownloading,
  isLinkOnly,
  isTextFile,
} from "@nookly/shared/data";
import {
  IconCode,
  IconFile,
  IconFileSpreadsheet,
  IconFileText,
  IconFileTypePdf,
  IconFileZip,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconPresentation,
  type Icon,
} from "@tabler/icons-react-native";

export const KIND_ICONS = {
  image: IconPhoto,
  pdf: IconFileTypePdf,
  document: IconFileText,
  sheet: IconFileSpreadsheet,
  slides: IconPresentation,
  archive: IconFileZip,
  audio: IconMusic,
  video: IconMovie,
  code: IconCode,
  other: IconFile,
} satisfies Record<FileKindId, Icon>;

export const KIND_LABELS = {
  image: "Image",
  pdf: "PDF",
  document: "Document",
  sheet: "Spreadsheet",
  slides: "Slides",
  archive: "Archive",
  audio: "Audio",
  video: "Video",
  code: "Code",
  other: "File",
} satisfies Record<FileKindId, string>;

export const nameOf = (file: FileRecord) => file.originalFilename ?? file.entity.title;

/// The stored copy on this phone, if there is one.
/// Where the file is on this phone, read from this app's own folder however it was stored.
export const pathOf = (file: FileRecord) => livePath(file.localPath ?? file.sourcePath);

/// How the viewer shows a file: a PDF with pages and search, text as text, anything else
/// as the system previews it, or nothing for a link or a file still on its way.
export type ViewerKind = "pdf" | "text" | "system" | "none";

export function viewerFor(file: FileRecord): ViewerKind {
  if (isLinkOnly(file) || isDownloading(file) || !pathOf(file)) return "none";
  return viewerForName(nameOf(file));
}

/// How the viewer shows a file on this phone called `name`.
export function viewerForName(name: string): ViewerKind {
  if (isTextFile(name)) return "text";
  return fileKindOf(name) === "pdf" ? "pdf" : "system";
}

/// Kinds the desktop draws a picture of in its list (`hasThumbnail`): pictures, PDFs,
/// videos, and documents, sheets and slides, but not plain text.
const THUMBNAIL_KINDS = new Set(["image", "pdf", "video", "document", "sheet", "slides"]);

/// Whether the Files list shows a picture of the file rather than its kind's icon.
export function hasThumbnail(file: FileRecord): boolean {
  if (viewerFor(file) === "none") return false;
  const name = nameOf(file);
  return THUMBNAIL_KINDS.has(fileKindOf(name)) && !isTextFile(name);
}
