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
  ["document", ["doc", "docx", "docm", "dotx", "pages", "rtf", "odt", "txt", "md"]],
  ["sheet", ["xls", "xlsx", "xlsm", "numbers", "csv", "ods"]],
  ["slides", ["ppt", "pptx", "key", "odp"]],
  ["archive", ["zip", "rar", "7z", "tar", "gz"]],
  ["audio", ["mp3", "wav", "m4a", "flac", "aac", "ogg"]],
  ["video", ["mp4", "mov", "mkv", "webm", "avi"]],
  [
    "code",
    [
      ...["js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rs", "go", "java", "c", "h", "cpp", "hpp"],
      ...["cs", "php", "rb", "json", "html", "htm", "css", "sql", "toml", "yaml", "yml", "ini"],
      ...["sh", "bash", "zsh"],
    ],
  ],
];

/// Every kind a filter can offer, in a stable order.
export const FILE_KINDS: FileKind[] = Object.entries(KINDS).map(([id, kind]) => ({ id, ...kind }));

/// Only a link, no stored copy: Files from before links were downloaded.
export function isLinkOnly(file: FileEntity): boolean {
  return !file.localPath && !file.sourcePath && Boolean(file.url);
}

/// Added by path and left where it is on disk, not copied into storage.
export function isReference(file: FileEntity): boolean {
  return !file.localPath && Boolean(file.sourcePath);
}

/// The file's bytes on disk: the stored copy, else the referenced original.
export function filePath(file: FileEntity): string | null {
  return file.localPath ?? file.sourcePath;
}

/// "pdf" for `Notes.PDF`, null for link-only files and names without one.
export function fileExtension(file: FileEntity): string | null {
  if (isLinkOnly(file)) return null;
  const name = file.originalFilename ?? displayTitle(file.entity);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

export function fileKind(file: FileEntity): FileKind {
  const id: KindId = isLinkOnly(file)
    ? (file.provider ?? "link")
    : (EXTENSIONS.find(([, exts]) => exts.includes(fileExtension(file) ?? ""))?.[0] ?? "other");
  return { id, ...KINDS[id] };
}

/// Plain text formats the viewer shows as text.
export const TEXT_EXTENSIONS = new Set([
  ...["txt", "md", "csv", "log"],
  ...(EXTENSIONS.find(([kind]) => kind === "code")?.[1] ?? []),
]);

/// How the viewer shows an office file: rendered in the app (Word, Excel), or
/// converted to PDF through LibreOffice when it's installed.
export type OfficeFormat = "docx" | "xlsx" | "convert";

const OFFICE_FORMATS: [OfficeFormat, string[]][] = [
  ["docx", ["docx", "docm", "dotx"]],
  ["xlsx", ["xlsx", "xlsm"]],
  ["convert", ["doc", "rtf", "odt", "pages", "xls", "ods", "numbers", "ppt", "pptx", "odp", "key"]],
];

export function officeFormat(file: FileEntity): OfficeFormat | null {
  const ext = fileExtension(file);
  return OFFICE_FORMATS.find(([, exts]) => ext !== null && exts.includes(ext))?.[0] ?? null;
}

/// Whether the file viewer can show it, rather than only offer to open it.
/// Office files count: the in app ones always, the rest once LibreOffice is there.
export function isViewable(file: FileEntity): boolean {
  if (!filePath(file)) return false;
  const kind = fileKind(file).id;
  const ext = fileExtension(file);
  return (
    ["image", "pdf", "video", "audio"].includes(kind) ||
    officeFormat(file) !== null ||
    (ext !== null && TEXT_EXTENSIONS.has(ext))
  );
}
