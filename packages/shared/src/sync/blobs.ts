import type { SqlValue } from "../schema.ts";
import { type SqlDriver, guard, ident, run } from "./sql.ts";

/// File contents between a device and the account's storage. A synced row holds
/// the SHA-256 of its file's contents (`blob`); each device keeps its own copy of
/// the file at a local path, and `blob_files` remembers which contents each local
/// path holds. That makes the direction plain:
///
/// - a local path this device hasn't recorded is a file it added or replaced: it is
///   hashed, uploaded, and only then does the row get its hash (an edit, synced);
/// - a row whose hash differs from what its recorded local file holds was changed
///   elsewhere: the contents are downloaded, checked against the hash, stored next
///   to the old copy (which stays on disk) and recorded.
///
/// A local file is never deleted, and a row only ever points at contents the server
/// confirmed. Everything is derived from the database, so a crash or a lost
/// connection loses nothing: the next run picks up where this one stopped.

export interface BlobColumn {
  table: string;
  /// The row's key column.
  key: string;
  /// The device local path of the file.
  path: string;
  /// The synced SHA-256 of its contents.
  blob: string;
  /// A column with the file's name, for its type and the name of a download.
  name?: string;
}

export const BLOB_COLUMNS: BlobColumn[] = [
  { table: "files", key: "entity_id", path: "local_path", blob: "blob", name: "original_filename" },
  { table: "recipes", key: "entity_id", path: "banner_path", blob: "banner_blob" },
  { table: "bookmarks", key: "entity_id", path: "screenshot_path", blob: "screenshot_blob" },
];

export interface BlobTarget {
  table: string;
  pk: string;
  /// A name for the stored file.
  filename: string;
}

/// What a device does with files: the desktop in Rust, the phone with expo-file-system.
export interface BlobPlatform {
  /// The SHA-256 and size of a local file; null when it is missing.
  hash(path: string): Promise<{ sha256: string; size: number } | null>;
  upload(sha256: string, path: string, contentType: string): Promise<void>;
  /// Downloads the contents, checks them against `sha256`, stores them where this
  /// device keeps files and points the row's path at them. Returns that path.
  download(sha256: string, target: BlobTarget): Promise<string>;
}

export interface BlobProgress {
  /// Files this device still has to send, and has sent this session.
  toUpload: number;
  uploaded: number;
  toDownload: number;
  downloaded: number;
  /// Files that failed and wait for a retry.
  waiting: number;
  lastError: string | null;
}

interface Pending {
  column: BlobColumn;
  pk: string;
  path: string | null;
  blob: string | null;
  name: string | null;
}

const TYPES = new Map([
  ["pdf", "application/pdf"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["heic", "image/heic"],
  ["mp4", "video/mp4"],
  ["mov", "video/quicktime"],
  ["mp3", "audio/mpeg"],
  ["m4a", "audio/mp4"],
  ["wav", "audio/wav"],
  ["txt", "text/plain"],
  ["md", "text/markdown"],
  ["csv", "text/csv"],
  ["json", "application/json"],
  ["html", "text/html"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["zip", "application/zip"],
]);

/// A file's media type from its name, `application/octet-stream` when unknown.
export function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return TYPES.get(ext) ?? "application/octet-stream";
}

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;
const text = (value: SqlValue | undefined) =>
  value === null || value === undefined ? null : String(value);

/// How long a failed file waits before the next try: 5 s, doubling, at most 10 min.
export function backoffMs(failures: number): number {
  return Math.min(600_000, 5_000 * 2 ** Math.max(0, failures - 1));
}

export class BlobSync {
  private readonly driver: SqlDriver;
  private readonly platform: BlobPlatform;
  private readonly now: () => number;
  private readonly failures = new Map<string, { count: number; until: number }>();
  private progress: BlobProgress = {
    toUpload: 0,
    uploaded: 0,
    toDownload: 0,
    downloaded: 0,
    waiting: 0,
    lastError: null,
  };

  constructor(options: { driver: SqlDriver; platform: BlobPlatform; now?: () => number }) {
    this.driver = options.driver;
    this.platform = options.platform;
    this.now = options.now ?? Date.now;
  }

  current(): BlobProgress {
    return { ...this.progress };
  }

  private async rows(
    column: BlobColumn,
  ): Promise<(Pending & { known: string | null; knownPath: string | null })[]> {
    const t = ident(column.table);
    const name = column.name ? `t.${ident(column.name)}` : "NULL";
    const rows = await this.driver.query(
      `SELECT t.${ident(column.key)} AS pk, t.${ident(column.path)} AS path, t.${ident(column.blob)} AS blob, ${name} AS name, b.path AS known_path, b.sha256 AS known
       FROM ${t} t LEFT JOIN blob_files b ON b.tbl = ? AND b.pk = t.${ident(column.key)}
       WHERE t.${ident(column.path)} IS NOT NULL OR t.${ident(column.blob)} IS NOT NULL`,
      [column.table],
    );
    return rows.map((r) => ({
      column,
      pk: String(r.pk),
      path: text(r.path),
      blob: text(r.blob),
      name: text(r.name),
      known: text(r.known),
      knownPath: text(r.known_path),
    }));
  }

  /// What has to go up and what has to come down, from the database alone.
  async plan(): Promise<{ uploads: Pending[]; downloads: Pending[] }> {
    const uploads: Pending[] = [];
    const downloads: Pending[] = [];
    for (const column of BLOB_COLUMNS) {
      for (const row of await this.rows(column)) {
        if (row.path !== null && row.path !== row.knownPath) uploads.push(row);
        else if (row.blob !== null && row.blob !== row.known) downloads.push(row);
      }
    }
    return { uploads, downloads };
  }

  private key(item: Pending) {
    return `${item.column.table}\u0000${item.pk}`;
  }

  private waiting(item: Pending): boolean {
    const failure = this.failures.get(this.key(item));
    return failure !== undefined && failure.until > this.now();
  }

  private failed(item: Pending, error: Error) {
    const key = this.key(item);
    const count = (this.failures.get(key)?.count ?? 0) + 1;
    this.failures.set(key, { count, until: this.now() + backoffMs(count) });
    this.progress.lastError = error.message;
  }

  /// Records which contents a local path holds, and (when it is this device's own
  /// new file) gives the row the hash, in one transaction guarded on the path, so a
  /// file replaced meanwhile is handled on the next run instead.
  private async record(item: Pending, path: string, sha256: string, setBlob: boolean) {
    const { table, key, path: pathColumn, blob } = item.column;
    const statements = [
      guard(
        1,
        `SELECT COUNT(*) FROM ${ident(table)} WHERE ${ident(key)} = ? AND ${ident(pathColumn)} = ?`,
        item.pk,
        path,
      ),
    ];
    if (setBlob) {
      statements.push(
        run(
          `UPDATE ${ident(table)} SET ${ident(blob)} = ? WHERE ${ident(key)} = ? AND ${ident(blob)} IS NOT ?`,
          sha256,
          item.pk,
          sha256,
        ),
      );
    }
    statements.push(
      run(
        "INSERT INTO blob_files (tbl, pk, path, sha256) VALUES (?, ?, ?, ?) ON CONFLICT (tbl, pk) DO UPDATE SET path = excluded.path, sha256 = excluded.sha256",
        table,
        item.pk,
        path,
        sha256,
      ),
    );
    return this.driver.batch(statements);
  }

  private async upload(item: Pending): Promise<boolean> {
    if (!item.path) return false;
    const hashed = await this.platform.hash(item.path);
    // A file that is gone from disk can't be sent; nothing is changed.
    if (!hashed) return false;
    if (item.blob !== hashed.sha256) {
      const name = item.name ?? basename(item.path);
      await this.platform.upload(hashed.sha256, item.path, contentTypeFor(name));
    }
    const result = await this.record(item, item.path, hashed.sha256, true);
    return result.outcome === "done";
  }

  private async download(item: Pending): Promise<boolean> {
    if (!item.blob) return false;
    const filename = item.name ?? (item.path ? basename(item.path) : `${item.blob.slice(0, 12)}`);
    const path = await this.platform.download(item.blob, {
      table: item.column.table,
      pk: item.pk,
      filename,
    });
    const result = await this.record(item, path, item.blob, false);
    return result.outcome === "done";
  }

  /// One pass: every upload, then every download, one at a time. A file that fails
  /// waits (`backoffMs`) and is tried again on a later pass.
  async runOnce(): Promise<BlobProgress> {
    const { uploads, downloads } = await this.plan();
    this.progress.toUpload = uploads.length;
    this.progress.toDownload = downloads.length;
    let waiting = 0;
    for (const [list, work, counter] of [
      [uploads, (i: Pending) => this.upload(i), "uploaded"],
      [downloads, (i: Pending) => this.download(i), "downloaded"],
    ] as const) {
      for (const item of list) {
        if (this.waiting(item)) {
          waiting += 1;
          continue;
        }
        try {
          if (await work(item)) {
            this.failures.delete(this.key(item));
            this.progress[counter] += 1;
            if (counter === "uploaded") this.progress.toUpload -= 1;
            else this.progress.toDownload -= 1;
          }
        } catch (error) {
          this.failed(item, error instanceof Error ? error : new Error(String(error)));
          waiting += 1;
        }
      }
    }
    this.progress.waiting = waiting;
    if (waiting === 0) this.progress.lastError = null;
    return this.current();
  }
}
