import { livePath } from "./reroot.ts";
import { removeStored } from "./remove-stored.ts";
import { withStallGuard } from "./stall-guard.ts";
import type { SqlDriver } from "@nookly/shared/sync";
import { BLOB_COLUMNS, type BlobPlatform } from "@nookly/shared/sync";
import type { ApiClient } from "@nookly/shared/api";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { UploadType } from "expo-file-system";

/// The files this phone keeps for the account: in the app's own documents folder,
/// one per contents, named by their hash. Syncing never deletes one: a file replaced
/// elsewhere leaves the old copy where it was. A sign out that clears the phone removes
/// the ones the account holds.
export const FILES_FOLDER = "files";

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/// The SHA-256 of a file's contents, read whole: files of a few hundred megabytes at
/// most go through a phone, and `expo-crypto` hashes in one go.
export async function sha256Of(file: File): Promise<string> {
  return hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes()));
}

/// A file name safe to store: its last part, without separators or a leading dot.
export function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f:]/g, "").replace(/^\.+/, "");
  return cleaned === "" ? "file" : cleaned;
}

/// How the shared file sync stores, hashes, uploads and downloads files here.
export function phoneBlobs(serverUrl: string, api: ApiClient, driver: SqlDriver): BlobPlatform {
  const base = serverUrl.replace(/\/+$/, "");
  return {
    async hash(path) {
      // A path stored under an earlier app folder (a restore onto another phone).
      const file = new File(livePath(path));
      if (!file.exists) return null;
      return { sha256: await sha256Of(file), size: file.size ?? 0 };
    },
    async upload(sha256, path, contentType) {
      const token = await api.sessionToken();
      if (!token) throw new Error("Sign in first.");
      const result = await new File(livePath(path)).upload(`${base}/v1/blobs/${sha256}`, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`The server answered ${result.status}.`);
      }
    },
    async remove(path, sha256) {
      const folder = new Directory(Paths.document, FILES_FOLDER).uri.replace(/\/*$/, "/");
      const file = new File(livePath(path));
      const stored = {
        uri: file.uri,
        exists: file.exists,
        sha256: () => sha256Of(file),
        delete: () => file.delete(),
      };
      return removeStored(stored, folder, sha256);
    },
    async download(sha256, target) {
      const token = await api.sessionToken();
      if (!token) throw new Error("Sign in first.");
      const folder = new Directory(Paths.document, FILES_FOLDER);
      folder.create({ intermediates: true, idempotent: true });
      const partial = new File(folder, `.${sha256}.partial`);
      if (partial.exists) partial.delete();
      // A download that stops moving is cancelled, so one lost connection never holds up the
      // files behind it: it waits, and is tried again.
      await withStallGuard((alive) => {
        const task = File.createDownloadTask(`${base}/v1/blobs/${sha256}`, partial, {
          headers: { authorization: `Bearer ${token}` },
          onProgress: alive,
        });
        return { done: task.downloadAsync(), cancel: () => task.cancel() };
      });
      // Only contents that match their hash are ever used.
      if ((await sha256Of(partial)) !== sha256) {
        partial.delete();
        throw new Error("The file changed on the way. It will be downloaded again.");
      }
      const stored = new File(folder, `${sha256.slice(0, 12)}-${safeName(target.filename)}`);
      if (stored.exists) stored.delete();
      partial.move(stored);
      const column = BLOB_COLUMNS.find((c) => c.table === target.table);
      if (!column) throw new Error(`No files in ${target.table}.`);
      await driver.batch([
        {
          sql: `UPDATE "${column.table}" SET "${column.path}" = ? WHERE "${column.key}" = ?`,
          params: [stored.uri, target.pk],
        },
      ]);
      return stored.uri;
    },
  };
}

/// Copies a file the person picked into this phone's own folder, named by its contents,
/// and says where it is. Picking the same file twice reuses the copy.
export async function storePicked(picked: File): Promise<{ name: string; uri: string }> {
  const name = safeName(picked.name);
  const folder = new Directory(Paths.document, FILES_FOLDER);
  folder.create({ intermediates: true, idempotent: true });
  const sha = await sha256Of(picked);
  const stored = new File(folder, `${sha.slice(0, 12)}-${name}`);
  if (!stored.exists) picked.copy(stored);
  return { name, uri: stored.uri };
}

/// The bytes of a base64 text, as a Nookly file carries the Files its blocks show.
export function base64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/// Stores a File that arrived inside a Nookly file, like a picked one: in this phone's own
/// folder, named by its contents. Returns where it is, for `importNooklyFile`'s `storeFile`.
export async function storeBase64(name: string, base64: string): Promise<string> {
  const folder = new Directory(Paths.document, FILES_FOLDER);
  folder.create({ intermediates: true, idempotent: true });
  const bytes = base64Bytes(base64);
  const sha = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  const stored = new File(folder, `${sha.slice(0, 12)}-${safeName(name)}`);
  if (!stored.exists) {
    stored.create();
    stored.write(bytes);
  }
  return stored.uri;
}
