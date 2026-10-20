import { type LocalDb, first, optStr, rows, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";

/// A File as the desktop stores it: its contents live on a device at `localPath` (a copy
/// made on that device) and in the account by their hash (`blob`).
export interface FileRecord {
  entity: EntityRecord;
  localPath: string | null;
  provider: string | null;
  url: string | null;
  originalFilename: string | null;
  sourcePath: string | null;
  blob: string | null;
}

const FILE_SELECT = `SELECT ${ENTITY_COLUMNS}, f.local_path, f.provider, f.url, f.original_filename, f.source_path, f.blob
  FROM entities e JOIN files f ON f.entity_id = e.id`;

function toFile(row: Record<string, string | number | null>): FileRecord {
  return {
    entity: toEntity(row),
    localPath: optStr(row.local_path),
    provider: optStr(row.provider),
    url: optStr(row.url),
    originalFilename: optStr(row.original_filename),
    sourcePath: optStr(row.source_path),
    blob: optStr(row.blob),
  };
}

/// A Space's files, or every Space's, newest first.
export async function listFiles(db: LocalDb, spaceId?: string): Promise<FileRecord[]> {
  return (
    await rows(
      db,
      `${FILE_SELECT} WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL${spaceId ? " AND e.space_id = ?" : ""} ORDER BY e.created_at DESC`,
      ...(spaceId ? [spaceId] : []),
    )
  ).map(toFile);
}

export async function getFile(db: LocalDb, id: string): Promise<FileRecord | null> {
  const row = await first(db, `${FILE_SELECT} WHERE e.id = ?`, id);
  return row ? toFile(row) : null;
}

/// A new File whose contents are already stored on this device at `localPath`. Sync
/// hashes and uploads them, and the other devices download them.
export async function addFile(
  db: LocalDb,
  spaceId: string,
  filename: string,
  localPath: string,
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "file", filename);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO files (entity_id, local_path, original_filename) VALUES (?, ?, ?)",
      params: [id, localPath, filename],
    },
  ]);
  return id;
}

/// Google Drive, Dropbox and iCloud links by name, as the desktop recognises them.
export function detectProvider(url: string): string | null {
  if (url.includes("drive.google.com") || url.includes("docs.google.com")) return "google_drive";
  if (url.includes("dropbox.com")) return "dropbox";
  if (url.includes("icloud.com")) return "icloud";
  return null;
}

/// A File that is a link to one kept elsewhere: Drive, Dropbox, iCloud, or a direct link to a
/// file. A link to a web page is refused; that is a bookmark.
export async function addFileLink(db: LocalDb, spaceId: string, url: string): Promise<string> {
  const link = url.trim();
  if (!/^https?:\/\//i.test(link)) throw new Error("Paste a link that starts with http or https.");
  const provider = detectProvider(link);
  const name = decodeURIComponent(link.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? link);
  const fileLike = /\.[a-z0-9]{2,5}$/i.test(name) && !/\.(html?|php|aspx?)$/i.test(name);
  if (!provider && !fileLike) {
    throw new Error("That is a web page. Save it as a bookmark instead.");
  }
  const { id, statements } = createEntityStatements(db, spaceId, "file", name);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO files (entity_id, provider, url, original_filename) VALUES (?, ?, ?, ?)",
      params: [id, provider, link, name],
    },
  ]);
  return id;
}

/// In the account, not on this device yet: its contents are on their way.
export const isDownloading = (file: FileRecord) =>
  !file.localPath && !file.sourcePath && Boolean(file.blob);

/// Only a link, no stored copy (Files from before links were downloaded).
export const isLinkOnly = (file: FileRecord) =>
  !file.localPath && !file.sourcePath && !file.blob && Boolean(file.url);

export type FileKindId =
  | "image"
  | "pdf"
  | "document"
  | "sheet"
  | "slides"
  | "archive"
  | "audio"
  | "video"
  | "code"
  | "other";

/// Extensions per kind, the same as the desktop's `file-kind.ts` (a test there keeps the
/// two equal).
export const FILE_EXTENSIONS: [FileKindId, string[]][] = [
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
      "js",
      "mjs",
      "cjs",
      "jsx",
      "ts",
      "tsx",
      "py",
      "rs",
      "go",
      "java",
      "c",
      "h",
      "cpp",
      "hpp",
      "cs",
      "php",
      "rb",
      "json",
      "html",
      "htm",
      "css",
      "sql",
      "toml",
      "yaml",
      "yml",
      "ini",
      "sh",
      "bash",
      "zsh",
    ],
  ],
];

export function fileExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1).toLowerCase() : null;
}

export function fileKindOf(filename: string): FileKindId {
  const ext = fileExtension(filename);
  return FILE_EXTENSIONS.find(([, list]) => ext && list.includes(ext))?.[0] ?? "other";
}

/// Extensions the viewer shows as text: the code ones, and plain text formats.
export const TEXT_EXTENSIONS = new Set([
  ...(FILE_EXTENSIONS.find(([kind]) => kind === "code")?.[1] ?? []),
  "txt",
  "md",
  "csv",
  "log",
]);

export const isTextFile = (filename: string) => TEXT_EXTENSIONS.has(fileExtension(filename) ?? "");
