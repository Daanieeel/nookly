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
export const pathOf = (file: FileRecord) => file.localPath ?? file.sourcePath;

/// How the viewer shows a file: a PDF with pages and search, text as text, anything else
/// as the system previews it, or nothing for a link or a file still on its way.
export type ViewerKind = "pdf" | "text" | "system" | "none";

export function viewerFor(file: FileRecord): ViewerKind {
  if (isLinkOnly(file) || isDownloading(file) || !pathOf(file)) return "none";
  const name = nameOf(file);
  if (isTextFile(name)) return "text";
  return fileKindOf(name) === "pdf" ? "pdf" : "system";
}
