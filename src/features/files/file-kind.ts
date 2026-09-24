import {
  IconBrandDropbox,
  IconBrandGoogleDrive,
  IconCloud,
  IconCode,
  IconFile,
  IconFileSpreadsheet,
  IconFileText,
  IconFileTypePdf,
  IconFileZip,
  IconLink,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconPresentation,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { FileEntity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

export interface FileKind {
  id: string;
  label: string;
  icon: TablerIcon;
  /// Tints the icon so a grid of files can be scanned by type.
  tone: string;
}

const KINDS = {
  image: { label: "Image", icon: IconPhoto, tone: "text-positive" },
  pdf: { label: "PDF", icon: IconFileTypePdf, tone: "text-destructive" },
  document: { label: "Document", icon: IconFileText, tone: "text-primary" },
  sheet: { label: "Spreadsheet", icon: IconFileSpreadsheet, tone: "text-positive" },
  slides: { label: "Slides", icon: IconPresentation, tone: "text-caution" },
  archive: { label: "Archive", icon: IconFileZip, tone: "text-muted-foreground" },
  audio: { label: "Audio", icon: IconMusic, tone: "text-primary" },
  video: { label: "Video", icon: IconMovie, tone: "text-primary" },
  code: { label: "Code", icon: IconCode, tone: "text-muted-foreground" },
  other: { label: "File", icon: IconFile, tone: "text-muted-foreground" },
  google_drive: { label: "Google Drive", icon: IconBrandGoogleDrive, tone: "text-positive" },
  dropbox: { label: "Dropbox", icon: IconBrandDropbox, tone: "text-primary" },
  icloud: { label: "iCloud", icon: IconCloud, tone: "text-primary" },
  link: { label: "Link", icon: IconLink, tone: "text-muted-foreground" },
} satisfies Record<string, Omit<FileKind, "id">>;

type KindId = keyof typeof KINDS;

const EXTENSIONS: [KindId, string[]][] = [
  ["image", ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg", "bmp", "avif"]],
  ["pdf", ["pdf"]],
  ["document", ["doc", "docx", "pages", "rtf", "odt", "txt", "md"]],
  ["sheet", ["xls", "xlsx", "numbers", "csv", "ods"]],
  ["slides", ["ppt", "pptx", "key", "odp"]],
  ["archive", ["zip", "rar", "7z", "tar", "gz"]],
  ["audio", ["mp3", "wav", "m4a", "flac", "aac", "ogg"]],
  ["video", ["mp4", "mov", "mkv", "webm", "avi"]],
  ["code", ["js", "ts", "tsx", "py", "rs", "java", "c", "cpp", "json", "html", "css"]],
];

/// Every kind a filter can offer, in a stable order.
export const FILE_KINDS: FileKind[] = Object.entries(KINDS).map(([id, kind]) => ({ id, ...kind }));

/// "pdf" for `Notes.PDF`, null for links and names without one.
export function fileExtension(file: FileEntity): string | null {
  if (file.url) return null;
  const name = file.originalFilename ?? displayTitle(file.entity);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

export function fileKind(file: FileEntity): FileKind {
  const id: KindId = file.url
    ? (file.provider ?? "link")
    : (EXTENSIONS.find(([, exts]) => exts.includes(fileExtension(file) ?? ""))?.[0] ?? "other");
  return { id, ...KINDS[id] };
}
