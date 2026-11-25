import type { TokenStore } from "@nookly/shared/api";
import type { Row } from "@nookly/shared/schema";
import type { BatchResult, BlobPlatform, SqlDriver } from "@nookly/shared/sync";
import { Channel, invoke } from "@tauri-apps/api/core";

/// The shared sync engine's way into this device's database (`src-tauri/src/sync`).
export const tauriSqlDriver: SqlDriver = {
  query: (sql, params) => invoke<Row[]>("sync_query", { sql, params }),
  batch: (statements) => invoke<BatchResult>("sync_batch", { statements }),
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
    hash: (path) => invoke<{ sha256: string; size: number } | null>("blob_hash", { path }),
    size: (path) => invoke<number | null>("blob_size", { path }),
    upload: (sha256, path, contentType, onSent) => {
      const onProgress = new Channel<number>();
      if (onSent) onProgress.onmessage = onSent;
      return invoke("blob_upload", { serverUrl, sha256, path, contentType, onProgress });
    },
    remove: (path, sha256) => invoke<boolean>("blob_remove", { path, sha256 }),
    download: (sha256, target) =>
      invoke<string>("blob_download", {
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
