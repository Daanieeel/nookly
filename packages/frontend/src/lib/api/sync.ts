import type { TokenStore } from "@nookly/shared/api";
import type { Row } from "@nookly/shared/schema";
import type { BatchResult, BlobPlatform, SqlDriver } from "@nookly/shared/sync";
import { Channel, invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { z } from "zod";
import { describeError } from "#/lib/log.ts";

const refusalSchema = z.object({ message: z.string() });

/// A command of the sync engine. Rust refuses with `{ kind, message }`; the engine reports
/// what failed by the message of an `Error`.
async function engineCommand<T>(command: string, args: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    const refusal = refusalSchema.safeParse(cause);
    throw new Error(refusal.success ? refusal.data.message : describeError(cause), { cause });
  }
}

let lastRequest: Promise<void> = Promise.resolve();
const settled = () => {};

/// One database request at a time, in the order they were made: Rust runs them off the
/// window's thread, where nothing else keeps them in order.
function inOrder<T>(request: () => Promise<T>): Promise<T> {
  const result = lastRequest.then(request);
  lastRequest = result.then(settled, settled);
  return result;
}

/// The shared sync engine's way into this device's database (`src-tauri/src/sync`).
export const tauriSqlDriver: SqlDriver = {
  query: (sql, params) => inOrder(() => engineCommand<Row[]>("sync_query", { sql, params })),
  batch: (statements) => inOrder(() => engineCommand<BatchResult>("sync_batch", { statements })),
};

/// The sync account's session token, in the OS keychain.
export const keychainTokens: TokenStore = {
  load: () => invoke<string | null>("sync_refresh_token"),
  save: (token) => invoke("sync_set_refresh_token", { token }),
};

/// Rebuilds search and mentions for entities whose rows arrived from elsewhere.
export function reindexEntities(entityIds: string[]): Promise<void> {
  return invoke("sync_reindex", { entityIds });
}

/// Files between this device and the account's storage, streamed by Rust
/// (`src-tauri/src/commands/blobs.rs`).
export function tauriBlobs(serverUrl: string): BlobPlatform {
  return {
    hash: (path) => engineCommand<{ sha256: string; size: number } | null>("blob_hash", { path }),
    size: (path) => engineCommand<number | null>("blob_size", { path }),
    upload: (sha256, path, contentType, onSent) => {
      const onProgress = new Channel<number>();
      if (onSent) onProgress.onmessage = onSent;
      return engineCommand("blob_upload", { serverUrl, sha256, path, contentType, onProgress });
    },
    remove: (path, sha256) => engineCommand<boolean>("blob_remove", { path, sha256 }),
    download: (sha256, target) =>
      engineCommand<string>("blob_download", {
        serverUrl,
        sha256,
        table: target.table,
        pk: target.pk,
        filename: target.filename,
      }),
  };
}

/// The full backup made before a first sync sends anything (`pre-sync-backups`).
export async function preSyncBackup(keep = false): Promise<{ path: string }> {
  const info = await invoke<{ path: string }>("create_pre_sync_backup", { keep });
  return { path: info.path };
}
