//! Sync, the desktop's side (see docs/development/sync-protocol.md).
//!
//! Sync is opt in and the app never needs it. While it is on, triggers (migration
//! 42) mark every changed row of a synced table in `sync_dirty`. The sync engine
//! itself is shared TypeScript (`packages/shared/src/sync`) that runs in the
//! frontend for the desktop and in the mobile app; here are only the pieces it
//! needs from the desktop: which tables sync and how (`registry`, exported to
//! `packages/shared` by `export_tests`), a command that runs its SQL in one
//! transaction (`batch`), rebuilding search and mentions after remote changes
//! land, and the account's refresh token in the keychain.

pub mod batch;
#[cfg(test)]
mod export_tests;
// The registry is what `export_tests` writes to `packages/shared`, which is where
// the engine reads it; the app itself never needs it at runtime.
#[cfg(test)]
mod registry;
pub mod secrets;
#[cfg(test)]
mod sync_tests;

use crate::error::AppResult;
use rusqlite::Connection;

/// Rebuilds what each device derives from synced rows for these entities, after
/// remote changes landed: the search index (title and body) and the mentions.
pub fn reindex(conn: &Connection, entity_ids: &[String]) -> AppResult<()> {
    for id in entity_ids {
        let Ok(entity) = crate::db::entities::get_entity(conn, id) else {
            continue;
        };
        crate::db::search::index_entity_title(conn, &entity.id, &entity.space_id, &entity.title)?;
        let has_blocks: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM blocks WHERE entity_id = ?1)",
            [id],
            |row| row.get(0),
        )?;
        if has_blocks {
            crate::db::notes::reindex_page(conn, id)?;
        }
    }
    Ok(())
}
