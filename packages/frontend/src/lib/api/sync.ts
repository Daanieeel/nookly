import type { TokenStore } from "@nookly/shared/api";
import type { Row } from "@nookly/shared/schema";
import type { BatchResult, SqlDriver } from "@nookly/shared/sync";
import { invoke } from "@tauri-apps/api/core";

/// The shared sync engine's way into this device's database (`src-tauri/src/sync`).
export const tauriSqlDriver: SqlDriver = {
  query: (sql, params) => invoke<Row[]>("sync_query", { sql, params }),
  batch: (statements) => invoke<BatchResult>("sync_batch", { statements }),
};

/// The sync account's refresh token, in the OS keychain.
export const keychainTokens: TokenStore = {
  load: () => invoke<string | null>("sync_refresh_token"),
  save: (token) => invoke("sync_set_refresh_token", { token }),
};

/// Rebuilds search and mentions for entities whose rows arrived from elsewhere.
export function reindexEntities(entityIds: string[]): Promise<void> {
  return invoke("sync_reindex", { entityIds });
}
