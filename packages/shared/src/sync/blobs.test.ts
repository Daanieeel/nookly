import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type BlobPlatform,
  type BlobTarget,
  BlobSync,
  backoffMs,
  contentTypeFor,
} from "./blobs.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/// One device's disk and the account's storage, in memory.
class FakePlatform implements BlobPlatform {
  readonly disk = new Map<string, string>();
  readonly calls: string[] = [];
  offline = false;
  private readonly driver: NodeSqliteDriver;
  private readonly store: Map<string, string>;

  constructor(driver: NodeSqliteDriver, store: Map<string, string>) {
    this.driver = driver;
    this.store = store;
  }

  async hash(path: string) {
    const body = this.disk.get(path);
    return body === undefined ? null : { sha256: sha(body), size: body.length };
  }

  async upload(sha256: string, path: string, contentType: string) {
    this.calls.push(`upload ${path} ${contentType}`);
    if (this.offline) throw new Error("offline");
    const body = this.disk.get(path) ?? "";
    if (sha(body) !== sha256) throw new Error("checksum_mismatch");
    this.store.set(sha256, body);
  }

  async download(sha256: string, target: BlobTarget) {
    this.calls.push(`download ${sha256.slice(0, 6)} ${target.filename}`);
    if (this.offline) throw new Error("offline");
    const body = this.store.get(sha256);
    if (body === undefined || sha(body) !== sha256) throw new Error("missing");
    const path = `/files/${sha256.slice(0, 6)}-${target.filename}`;
    this.disk.set(path, body);
    this.driver.exec("UPDATE files SET local_path = ? WHERE entity_id = ?", path, target.pk);
    return path;
  }
}

const now = () => new Date().toISOString();

function device(store = new Map<string, string>(), clock = { t: 1_000_000 }) {
  const driver = new NodeSqliteDriver();
  const platform = new FakePlatform(driver, store);
  const blobs = new BlobSync({ driver, platform, now: () => clock.t });
  driver.exec(
    "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
    now(),
    now(),
  );
  return { driver, platform, blobs, store, clock };
}

function addFile(d: ReturnType<typeof device>, id: string, path: string | null, body?: string) {
  d.driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 's1', 'file', ?, ?, ?, 'FIL', 1)",
    id,
    id,
    now(),
    now(),
  );
  d.driver.exec(
    "INSERT INTO files (entity_id, local_path, original_filename) VALUES (?, ?, ?)",
    id,
    path,
    "notes.pdf",
  );
  if (path && body !== undefined) d.platform.disk.set(path, body);
}

const blobOf = (d: ReturnType<typeof device>, id: string) =>
  d.driver.rows("SELECT blob FROM files WHERE entity_id = ?", id)[0]?.blob ?? null;

describe("file contents", () => {
  it("uploads a file this device added, then gives the row its hash", async () => {
    const d = device();
    addFile(d, "f1", "/files/a.pdf", "lecture one");
    const progress = await d.blobs.runOnce();
    expect(d.platform.calls).toEqual(["upload /files/a.pdf application/pdf"]);
    expect(blobOf(d, "f1")).toBe(sha("lecture one"));
    expect(d.store.get(sha("lecture one"))).toBe("lecture one");
    expect(progress).toMatchObject({ uploaded: 1, toUpload: 0, waiting: 0 });
    // Done once: the next run has nothing to do.
    d.platform.calls.length = 0;
    await d.blobs.runOnce();
    expect(d.platform.calls).toEqual([]);
  });

  it("keeps everything when an upload fails, and tries again after a while", async () => {
    const d = device();
    addFile(d, "f1", "/files/a.pdf", "lecture one");
    d.platform.offline = true;
    const failed = await d.blobs.runOnce();
    expect(failed).toMatchObject({ uploaded: 0, waiting: 1, lastError: "offline" });
    expect(blobOf(d, "f1")).toBeNull();
    expect(d.driver.rows("SELECT * FROM blob_files")).toEqual([]);
    expect(d.platform.disk.get("/files/a.pdf")).toBe("lecture one");
    // Back online, but still inside the wait: not tried yet.
    d.platform.offline = false;
    d.platform.calls.length = 0;
    await d.blobs.runOnce();
    expect(d.platform.calls).toEqual([]);
    d.clock.t += backoffMs(1);
    await d.blobs.runOnce();
    expect(blobOf(d, "f1")).toBe(sha("lecture one"));
  });

  it("downloads contents changed on another device and keeps the old copy on disk", async () => {
    const store = new Map<string, string>();
    const d = device(store);
    addFile(d, "f1", "/files/a.pdf", "version one");
    await d.blobs.runOnce();
    // Another device replaced the file: its contents are in the store, the row
    // (synced) has the new hash.
    store.set(sha("version two"), "version two");
    d.driver.exec("UPDATE files SET blob = ? WHERE entity_id = 'f1'", sha("version two"));
    d.platform.calls.length = 0;
    await d.blobs.runOnce();
    expect(d.platform.calls).toEqual([`download ${sha("version two").slice(0, 6)} notes.pdf`]);
    const [row] = d.driver.rows("SELECT local_path FROM files WHERE entity_id = 'f1'");
    expect(d.platform.disk.get(String(row.local_path))).toBe("version two");
    expect(d.platform.disk.get("/files/a.pdf")).toBe("version one");
  });

  it("never sends an out of date copy over a newer one from another device", async () => {
    const store = new Map<string, string>();
    const d = device(store);
    addFile(d, "f1", "/files/a.pdf", "version one");
    await d.blobs.runOnce();
    store.set(sha("version two"), "version two");
    d.driver.exec("UPDATE files SET blob = ? WHERE entity_id = 'f1'", sha("version two"));
    d.platform.calls.length = 0;
    await d.blobs.runOnce();
    expect(d.platform.calls.some((c) => c.startsWith("upload"))).toBe(false);
    expect(blobOf(d, "f1")).toBe(sha("version two"));
  });

  it("downloads a file this device never had", async () => {
    const store = new Map([[sha("from the phone"), "from the phone"]]);
    const d = device(store);
    addFile(d, "f1", null);
    d.driver.exec("UPDATE files SET blob = ? WHERE entity_id = 'f1'", sha("from the phone"));
    const progress = await d.blobs.runOnce();
    expect(progress.downloaded).toBe(1);
    const [row] = d.driver.rows("SELECT local_path FROM files WHERE entity_id = 'f1'");
    expect(d.platform.disk.get(String(row.local_path))).toBe("from the phone");
  });

  it("finishes the record after a crash between download and bookkeeping, without uploading", async () => {
    const store = new Map([[sha("from the phone"), "from the phone"]]);
    const d = device(store);
    addFile(d, "f1", null);
    d.driver.exec("UPDATE files SET blob = ? WHERE entity_id = 'f1'", sha("from the phone"));
    // The download landed and the row points at it, then the app died.
    await d.platform.download(sha("from the phone"), { table: "files", pk: "f1", filename: "x" });
    d.platform.calls.length = 0;
    await d.blobs.runOnce();
    expect(d.platform.calls).toEqual([]);
    expect(d.driver.rows("SELECT sha256 FROM blob_files")).toEqual([
      { sha256: sha("from the phone") },
    ]);
  });

  it("leaves a row alone when its file is gone from disk", async () => {
    const d = device();
    addFile(d, "f1", "/files/missing.pdf");
    await d.blobs.runOnce();
    expect(d.platform.calls).toEqual([]);
    expect(blobOf(d, "f1")).toBeNull();
  });

  it("uploads a replacement this device made", async () => {
    const d = device();
    addFile(d, "f1", "/files/a.pdf", "version one");
    await d.blobs.runOnce();
    d.platform.disk.set("/files/b.pdf", "version two");
    d.driver.exec("UPDATE files SET local_path = '/files/b.pdf' WHERE entity_id = 'f1'");
    await d.blobs.runOnce();
    expect(blobOf(d, "f1")).toBe(sha("version two"));
  });
});

it("names a file's type from its name", () => {
  expect(contentTypeFor("Lecture 3.PDF")).toBe("application/pdf");
  expect(contentTypeFor("banner.jpeg")).toBe("image/jpeg");
  expect(contentTypeFor("archive.unknown")).toBe("application/octet-stream");
});
