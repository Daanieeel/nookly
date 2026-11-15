//! `nookly cli sync status`: whether sync is on, its server, the changes waiting to go
//! and the clashes waiting for the person. Signing in and out and the session itself stay
//! in the app; the session lives in the keychain and is never read here.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

pub fn command(conn: &Connection, data_dir: &Path, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(usage());
    };
    super::run_command(&argv[1..], |_| match verb.as_str() {
        "status" => status(conn, data_dir),
        other => Err(AppError::InvalidInput(format!(
            "unknown sync command '{other}', expected status. Signing in and out is done in the app"
        ))),
    })
}

pub fn usage() -> Value {
    json!({
        "status": "nookly cli sync status  (whether sync is on, the server, changes waiting to go, clashes waiting for the person)",
        "note": "Signing in and out is done in the app, Settings, Account. The session stays in the keychain and is never shown.",
    })
}

fn meta(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM sync_meta WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

fn count(conn: &Connection, sql: &str) -> AppResult<i64> {
    Ok(conn.query_row(sql, [], |r| r.get(0))?)
}

fn status(conn: &Connection, data_dir: &Path) -> AppResult<Value> {
    Ok(json!({
        "on": meta(conn, "enabled")?.is_some(),
        "serverUrl": super::settings::value(data_dir, "sync.serverUrl")?,
        "deviceId": meta(conn, "device_id")?,
        "changesWaiting": count(conn, "SELECT COUNT(*) FROM sync_dirty")?,
        "openClashes": count(conn, "SELECT COUNT(*) FROM sync_conflicts WHERE resolved_at IS NULL")?,
    }))
}
