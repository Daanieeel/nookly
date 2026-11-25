import { retryAfterSeconds } from "../api/rate-limit.ts";
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
///   elsewhere, and one without a local path has no copy here: the contents are
///   downloaded, checked against the hash, stored next to any old copy (which stays
///   on disk) and recorded.
///
/// Syncing never deletes a local file; only a sign out that clears the device removes
/// the ones the account holds (`confirmed`). A row only ever points at contents the
/// server confirmed. Everything is derived from the database, so a crash or a lost
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
  /// The size of a local file in bytes; null when it is missing.
  size(path: string): Promise<number | null>;
  /// Sends a file, telling `onSent` how many bytes have gone so far.
  upload(
    sha256: string,
    path: string,
    contentType: string,
    onSent?: (bytes: number) => void,
  ): Promise<void>;
  /// Downloads the contents, checks them against `sha256`, stores them where this
  /// device keeps files and points the row's path at them. Returns that path.
  download(sha256: string, target: BlobTarget): Promise<string>;
  /// Deletes a local file, only when it lies in the folders Nookly keeps files in and
  /// still holds exactly `sha256`. Whether it was deleted.
  remove(path: string, sha256: string): Promise<boolean>;
}

/// A local file whose contents the account holds.
export interface StoredFile {
  path: string;
  sha256: string;
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
  /// The uploads of the pass running now, or of the last one: how many files and bytes it
  /// set out with, and how much of that has gone, the files on their way included.
  passFiles: number;
  passFilesSent: number;
  passBytes: number;
  passBytesSent: number;
}

/// No progress yet.
export const NO_BLOB_PROGRESS: BlobProgress = {
  toUpload: 0,
  uploaded: 0,
  toDownload: 0,
  downloaded: 0,
  waiting: 0,
  lastError: null,
  passFiles: 0,
  passFilesSent: 0,
  passBytes: 0,
  passBytesSent: 0,
};

/// The least time between two reports of an upload on its way.
const REPORT_MS = 100;

interface Pending {
  column: BlobColumn;
  pk: string;
  path: string | null;
  blob: string | null;
  name: string | null;
  /// The local path recorded for this row; empty once the device left the account it
  /// was recorded for (`SyncEngine.disable`).
  knownPath: string | null;
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

/// How many files come down together: enough that a slow one does not hold up the rest, few
/// enough that a phone hashing each as it lands does not run out of memory.
export const DOWNLOADS_AT_ONCE = 5;
/// How many files go up together: a single upload rarely fills the connection, a few do.
export const UPLOADS_AT_ONCE = 3;

export class BlobSync {
  private readonly driver: SqlDriver;
  private readonly platform: BlobPlatform;
  private readonly holds: (sha256: string) => Promise<boolean>;
  private readonly now: () => number;
  private readonly failures = new Map<string, { count: number; until: number }>();
  private progress: BlobProgress = { ...NO_BLOB_PROGRESS };
  private readonly onProgress?: (progress: BlobProgress) => void;
  private reportedAt = 0;
  /// Bytes gone per file of this pass: all of a sent one, so far of one on its way.
  private readonly sent = new Map<string, number>();

  private readonly downloadsAtOnce: number;
  private readonly uploadsAtOnce: number;
  private cancelled = false;
  /// No file moves before this: the server asked for a break.
  private pausedUntil = 0;

  constructor(options: {
    driver: SqlDriver;
    platform: BlobPlatform;
    /// Whether the account has these contents already.
    holds: (sha256: string) => Promise<boolean>;
    now?: () => number;
    downloadsAtOnce?: number;
    uploadsAtOnce?: number;
    /// Told as uploads move, at most every `REPORT_MS` while a file is on its way.
    onProgress?: (progress: BlobProgress) => void;
  }) {
    this.onProgress = options.onProgress;
    this.downloadsAtOnce = Math.max(1, options.downloadsAtOnce ?? DOWNLOADS_AT_ONCE);
    this.uploadsAtOnce = Math.max(1, options.uploadsAtOnce ?? UPLOADS_AT_ONCE);
    this.driver = options.driver;
    this.platform = options.platform;
    this.holds = options.holds;
    this.now = options.now ?? Date.now;
  }

  current(): BlobProgress {
    return { ...this.progress };
  }

  private async rows(column: BlobColumn): Promise<(Pending & { known: string | null })[]> {
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
        else if (row.blob !== null && (row.blob !== row.known || row.path === null))
          downloads.push(row);
      }
    }
    return { uploads, downloads };
  }

  /// The files still to go up and their bytes. One gone from disk can't be sent, so it
  /// isn't counted.
  async waitingUploads(): Promise<{ files: number; bytes: number }> {
    const { uploads } = await this.plan();
    const sizes = await this.sizes(uploads);
    return {
      files: sizes.size,
      bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
    };
  }

  /// The size of each upload whose file is on disk, by its key.
  private async sizes(uploads: Pending[]): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    for (const item of uploads) {
      const size = item.path ? await this.platform.size(item.path) : null;
      if (size !== null) sizes.set(this.key(item), size);
    }
    return sizes;
  }

  private moved(key: string, bytes: number, always = false) {
    this.sent.set(key, bytes);
    this.progress.passBytesSent = [...this.sent.values()].reduce((sum, n) => sum + n, 0);
    if (always || this.now() - this.reportedAt >= REPORT_MS) this.report();
  }

  private report() {
    this.reportedAt = this.now();
    this.onProgress?.(this.current());
  }

  private key(item: Pending) {
    return `${item.column.table}\u0000${item.pk}`;
  }

  private waiting(item: Pending): boolean {
    const failure = this.failures.get(this.key(item));
    return failure !== undefined && failure.until > this.now();
  }

  private paused(): boolean {
    return this.now() < this.pausedUntil;
  }

  private failed(item: Pending, error: Error) {
    const wait = retryAfterSeconds(error.message);
    this.progress.lastError = error.message;
    // Too many requests is about this device, not the file: all of them wait that long,
    // and none of them longer for it.
    if (wait !== null) {
      this.pausedUntil = this.now() + wait * 1000;
      return;
    }
    const key = this.key(item);
    const count = (this.failures.get(key)?.count ?? 0) + 1;
    this.failures.set(key, { count, until: this.now() + backoffMs(count) });
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

  private async upload(item: Pending, size: number): Promise<boolean> {
    if (!item.path) return false;
    const hashed = await this.platform.hash(item.path);
    // A file that is gone from disk can't be sent; nothing is changed.
    if (!hashed) return false;
    // A row that carries the hash already was synced with the account. A device that left
    // it since asks the account it is in now, which may be another one.
    const sent =
      item.blob === hashed.sha256 && (item.knownPath !== "" || (await this.holds(hashed.sha256)));
    if (!sent) {
      const name = item.name ?? basename(item.path);
      const key = this.key(item);
      await this.platform.upload(hashed.sha256, item.path, contentTypeFor(name), (bytes) =>
        this.moved(key, Math.min(size, bytes)),
      );
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
    // The device was cleared while this came in: the account holds it, so it goes too.
    if (result.outcome !== "done" && this.cancelled) await this.platform.remove(path, item.blob);
    return result.outcome === "done";
  }

  /// No further file is started; what is on its way finishes.
  cancel() {
    this.cancelled = true;
  }

  /// The local files the account holds: the row points at the file, the record of what
  /// the file holds matches it, and the account's row (as the server last had it) names
  /// the same contents. A path any other row still needs here is left out.
  async confirmed(): Promise<StoredFile[]> {
    const stored = new Map<string, string>();
    const needed = new Set<string>();
    for (const column of BLOB_COLUMNS) {
      const key = `t.${ident(column.key)}`;
      const path = `t.${ident(column.path)}`;
      const blob = `t.${ident(column.blob)}`;
      const rows = await this.driver.query(
        `SELECT ${path} AS path, ${blob} AS blob,
           (b.path = ${path} AND b.sha256 = ${blob} AND json_extract(r.fields, ?) = ${blob}) AS held
         FROM ${ident(column.table)} t
         LEFT JOIN blob_files b ON b.tbl = ? AND b.pk = ${key}
         LEFT JOIN sync_rows r ON r.tbl = ? AND r.pk = ${key}
         WHERE ${path} IS NOT NULL`,
        [`$.${column.blob}`, column.table, column.table],
      );
      for (const row of rows) {
        if (row.held === 1) stored.set(String(row.path), String(row.blob));
        else needed.add(String(row.path));
      }
    }
    return [...stored]
      .filter(([path]) => !needed.has(path))
      .map(([path, sha256]) => ({ path, sha256 }));
  }

  /// Deletes local files the account holds. One that can't be deleted stays.
  async remove(files: StoredFile[]): Promise<void> {
    for (const file of files) {
      await this.platform.remove(file.path, file.sha256).catch(() => false);
    }
  }

  /// One pass: the uploads `uploadsAtOnce` at a time, then the downloads `downloadsAtOnce` at
  /// a time, so one slow file does not hold up the rest. A file that fails waits (`backoffMs`) and is
  /// tried again on a later pass. Once the server says there were too many requests, no
  /// further file starts until the time it named has passed.
  async runOnce(): Promise<BlobProgress> {
    const { uploads, downloads } = await this.plan();
    this.progress.toUpload = uploads.length;
    this.progress.toDownload = downloads.length;
    const sizes = await this.sizes(uploads);
    this.sent.clear();
    this.progress.passFiles = sizes.size;
    this.progress.passFilesSent = 0;
    this.progress.passBytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);
    this.progress.passBytesSent = 0;
    if (sizes.size > 0) this.report();
    let waiting = 0;
    const handle = async (
      item: Pending,
      work: (i: Pending) => Promise<boolean>,
      counter: "uploaded" | "downloaded",
    ) => {
      if (this.waiting(item)) {
        waiting += 1;
        return;
      }
      try {
        if (await work(item)) {
          this.failures.delete(this.key(item));
          this.progress[counter] += 1;
          if (counter === "uploaded") {
            this.progress.toUpload -= 1;
            const size = sizes.get(this.key(item));
            if (size !== undefined) {
              this.progress.passFilesSent += 1;
              this.moved(this.key(item), size, true);
            }
          } else this.progress.toDownload -= 1;
        }
      } catch (error) {
        if (counter === "uploaded") this.moved(this.key(item), 0, true);
        this.failed(item, error instanceof Error ? error : new Error(String(error)));
        waiting += 1;
      }
    };
    // Each worker takes the next file as soon as it finishes one.
    const pool = async (
      items: Pending[],
      size: number,
      work: (i: Pending) => Promise<boolean>,
      counter: "uploaded" | "downloaded",
    ) => {
      const queue = [...items];
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          if (this.cancelled || this.paused()) return;
          await handle(item, work, counter);
        }
      };
      await Promise.all(Array.from({ length: Math.min(size, queue.length) }, worker));
    };
    await pool(
      uploads,
      this.uploadsAtOnce,
      (i) => this.upload(i, sizes.get(this.key(i)) ?? 0),
      "uploaded",
    );
    await pool(downloads, this.downloadsAtOnce, (i) => this.download(i), "downloaded");
    if (this.paused()) waiting = this.progress.toUpload + this.progress.toDownload;
    this.progress.waiting = waiting;
    if (waiting === 0) this.progress.lastError = null;
    return this.current();
  }
}
