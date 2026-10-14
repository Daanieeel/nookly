import type { SqlDriver } from "@nookly/shared/sync";
import { BLOB_COLUMNS, type BlobPlatform } from "@nookly/shared/sync";
import type { ApiClient } from "@nookly/shared/api";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { UploadType } from "expo-file-system";

/// The files this phone keeps for the account: in the app's own documents folder,
/// one per contents, named by their hash. Nothing is ever deleted: a file replaced
/// elsewhere leaves the old copy where it was.
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
      const file = new File(path);
      if (!file.exists) return null;
      return { sha256: await sha256Of(file), size: file.size ?? 0 };
    },
    async upload(sha256, path, contentType) {
      const token = await api.sessionToken();
      if (!token) throw new Error("Sign in first.");
      const result = await new File(path).upload(`${base}/v1/blobs/${sha256}`, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`The server answered ${result.status}.`);
      }
    },
    async download(sha256, target) {
      const token = await api.sessionToken();
      if (!token) throw new Error("Sign in first.");
      const folder = new Directory(Paths.document, FILES_FOLDER);
      folder.create({ intermediates: true, idempotent: true });
      const partial = new File(folder, `.${sha256}.partial`);
      if (partial.exists) partial.delete();
      await File.downloadFileAsync(`${base}/v1/blobs/${sha256}`, partial, {
        headers: { authorization: `Bearer ${token}` },
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
