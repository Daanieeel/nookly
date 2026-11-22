import type { SqlStatement } from "../sync/sql.ts";
import { labelColorFor } from "../colors.ts";
import { type LocalDb, first, iso, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";
import { LABEL_IDS_COLUMN, labelIdsOf } from "./links.ts";

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
  /// The labels on it, to filter by.
  labelIds: string[];
  /// What it is attached to (`attached-file`), live items only, by title.
  attachedTo: { id: string; title: string; type: string }[];
  /// The live Courses it belongs to: attached to one directly, or to something linked to one
  /// (an Assignment, an Exam, a Session, a Note of the Course). As the desktop's.
  courses: { id: string; title: string }[];
}

const FILE_SELECT = `SELECT ${ENTITY_COLUMNS}, f.local_path, f.provider, f.url, f.original_filename, f.source_path, f.blob, ${LABEL_IDS_COLUMN}
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
    labelIds: labelIdsOf(row),
    attachedTo: [],
    courses: [],
  };
}

/// Fills in what each file is attached to and its Courses, in two queries for all of them.
async function withLinks(db: LocalDb, files: FileRecord[]): Promise<FileRecord[]> {
  if (files.length === 0) return files;
  const marks = files.map(() => "?").join(", ");
  const ids = files.map((f) => f.entity.id);
  const owners = await rows(
    db,
    `SELECT r.to_entity_id AS file_id, o.id, o.title, o.type FROM relationships r
     JOIN entities o ON o.id = r.from_entity_id
     WHERE r.relationship_type = 'attached-file' AND r.to_entity_id IN (${marks})
       AND o.deleted_at IS NULL
     ORDER BY o.title COLLATE NOCASE`,
    ...ids,
  );
  const courses = await rows(
    db,
    `SELECT DISTINCT a.to_entity_id AS file_id, c.id, c.title FROM relationships a
     JOIN entities o ON o.id = a.from_entity_id AND o.deleted_at IS NULL
     LEFT JOIN relationships rc ON o.type != 'course'
       AND (rc.from_entity_id = o.id OR rc.to_entity_id = o.id)
     JOIN entities c ON c.type = 'course' AND c.deleted_at IS NULL AND c.id = CASE
       WHEN o.type = 'course' THEN o.id
       WHEN rc.from_entity_id = o.id THEN rc.to_entity_id
       ELSE rc.from_entity_id END
     WHERE a.relationship_type = 'attached-file' AND a.to_entity_id IN (${marks})
     ORDER BY c.title COLLATE NOCASE`,
    ...ids,
  );
  return files.map((file) => ({
    ...file,
    attachedTo: owners
      .filter((o) => str(o.file_id) === file.entity.id)
      .map((o) => ({ id: str(o.id), title: str(o.title), type: str(o.type) })),
    courses: courses
      .filter((c) => str(c.file_id) === file.entity.id)
      .map((c) => ({ id: str(c.id), title: str(c.title) })),
  }));
}

/// A Space's files, or every Space's, newest first.
export async function listFiles(db: LocalDb, spaceId?: string): Promise<FileRecord[]> {
  const found = (
    await rows(
      db,
      `${FILE_SELECT} WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL${spaceId ? " AND e.space_id = ?" : ""} ORDER BY e.created_at DESC`,
      ...(spaceId ? [spaceId] : []),
    )
  ).map(toFile);
  return withLinks(db, found);
}

export async function getFile(db: LocalDb, id: string): Promise<FileRecord | null> {
  const row = await first(db, `${FILE_SELECT} WHERE e.id = ?`, id);
  if (!row) return null;
  const [file] = await withLinks(db, [toFile(row)]);
  return file ?? null;
}

/// A new File whose contents are already stored on this device at `localPath`. Sync
/// hashes and uploads them, and the other devices download them.
export async function addFile(
  db: LocalDb,
  spaceId: string,
  filename: string,
  localPath: string,
): Promise<string> {
  const { id, statements } = addFileStatements(db, spaceId, filename, localPath);
  await write(db, statements);
  return id;
}

/// A new name for a File, as the person typed it. The extension it had is kept, so it still
/// opens as what it is; a blank name changes nothing.
export async function renameFile(db: LocalDb, id: string, name: string): Promise<void> {
  const file = await getFile(db, id);
  const typed = name.trim();
  if (!file || typed === "") return;
  const extension = fileExtension(file.originalFilename ?? file.entity.title);
  const named = extension && fileExtension(typed) !== extension ? `${typed}.${extension}` : typed;
  await write(db, [
    {
      sql: "UPDATE entities SET title = ?, updated_at = ? WHERE id = ?",
      params: [named, iso(db), id],
    },
    { sql: "UPDATE files SET original_filename = ? WHERE entity_id = ?", params: [named, id] },
  ]);
}

/// `addFile` as statements, for an import that makes a File together with what shows it.
export function addFileStatements(
  db: LocalDb,
  spaceId: string,
  filename: string,
  localPath: string,
) {
  const made = createEntityStatements(db, spaceId, "file", filename);
  return {
    id: made.id,
    statements: [
      ...made.statements,
      {
        sql: "INSERT INTO files (entity_id, local_path, original_filename) VALUES (?, ?, ?)",
        params: [made.id, localPath, filename],
      } satisfies SqlStatement,
    ],
  };
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

export interface ImportDetails {
  /// What the File is stored as on this device.
  filename: string;
  localPath: string;
  /// The name it shows; the stored file's name when left out.
  title?: string;
  /// Where it came from (`moodle:<address on the site>`), how a source tells it was imported.
  origin: string;
  /// Labels of the Space to put on it.
  labelIds: string[];
  /// Labels by name: one the Space has by that name (ignoring case) is reused, a new one made.
  newLabels: string[];
  /// Items it is attached to (a course), as `attached-file`.
  attachTo: string[];
}

/// The desktop's `import_file_with_details`: a File made named, labelled and attached at once,
/// so it lands whole or not at all.
export async function importFileWithDetails(
  db: LocalDb,
  spaceId: string,
  details: ImportDetails,
): Promise<string> {
  const { id, statements } = addFileStatements(db, spaceId, details.filename, details.localPath);
  const title = details.title?.trim();
  if (title) {
    statements.push({ sql: "UPDATE entities SET title = ? WHERE id = ?", params: [title, id] });
  }
  statements.push({
    sql: "UPDATE files SET origin = ? WHERE entity_id = ?",
    params: [details.origin, id],
  });
  const labelIds = [...details.labelIds];
  for (const raw of details.newLabels) {
    const name = raw.trim();
    if (!name) throw new Error("Give the label a name.");
    const existing = await first(
      db,
      "SELECT id FROM labels WHERE space_id = ? AND name = ? COLLATE NOCASE",
      spaceId,
      name,
    );
    if (existing) {
      labelIds.push(String(existing.id));
      continue;
    }
    const labelId = db.newId();
    statements.push({
      sql: "INSERT INTO labels (id, space_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [labelId, spaceId, name, labelColorFor(name), iso(db)],
    });
    labelIds.push(labelId);
  }
  for (const labelId of new Set(labelIds)) {
    statements.push({
      sql: "INSERT OR IGNORE INTO entity_labels (entity_id, label_id) SELECT ?, id FROM labels WHERE id = ? AND space_id = ?",
      params: [id, labelId, spaceId],
    });
  }
  for (const owner of details.attachTo) {
    statements.push({
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'attached-file', ?)",
      params: [db.newId(), owner, id, iso(db)],
    });
  }
  await write(db, statements);
  return id;
}

/// The File imported from `origin` and not in the Trash, or null.
export async function fileWithOrigin(db: LocalDb, origin: string): Promise<string | null> {
  const row = await first(
    db,
    "SELECT e.id FROM files f JOIN entities e ON e.id = f.entity_id WHERE f.origin = ? AND e.deleted_at IS NULL ORDER BY e.created_at DESC",
    origin,
  );
  return row ? String(row.id) : null;
}
