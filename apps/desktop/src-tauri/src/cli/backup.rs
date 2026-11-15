//! `nookly cli backup`: back up now and list the backups, as Settings, Backup does, into
//! the folder set there (`backup.folder`) or one given with `--folder`. Restoring replaces
//! everything on this device, so it stays in the app, behind its typed confirmation.

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde_json::{json, Value};

use super::Args;
use crate::error::{AppError, AppResult};

/// How many backups a folder keeps, the app's `BACKUP_KEEP` (a test keeps them the same).
pub const BACKUP_KEEP: usize = 10;

pub fn command(conn: &Connection, data_dir: &Path, argv: &[String]) -> AppResult<Value> {
    let Some(verb) = argv.first() else {
        return Ok(usage());
    };
    super::run_command(&argv[1..], |args| run(conn, data_dir, verb, args))
}

pub fn usage() -> Value {
    json!({
        "now": "nookly cli backup now [--folder <path>]  (into the folder from Settings, `backup.folder`, unless --folder is given; keeps the newest 10 there)",
        "list": "nookly cli backup list [--folder <path>]  (newest first)",
        "note": "Restoring a backup replaces everything on this device, so it is done in the app, Settings, Backup.",
    })
}

fn folder(data_dir: &Path, args: &Args) -> AppResult<PathBuf> {
    if let Some(folder) = args.flag("folder") {
        return Ok(PathBuf::from(folder));
    }
    match super::settings::value(data_dir, "backup.folder")? {
        Value::String(folder) if !folder.is_empty() => Ok(PathBuf::from(folder)),
        _ => Err(AppError::InvalidInput(
            "no backup folder is set. Pass --folder <path>, or set one with `nookly cli settings set backup.folder <path>`".into(),
        )),
    }
}

fn run(conn: &Connection, data_dir: &Path, verb: &str, args: &Args) -> AppResult<Value> {
    match verb {
        "now" => {
            let dest = folder(data_dir, args)?;
            let snapshot = crate::backup::snapshot(conn)?;
            let info = crate::backup::create_backup(snapshot, data_dir, &dest, BACKUP_KEEP)?;
            crate::error::to_json(info)
        }
        "list" => {
            let backups = crate::backup::list_backups(&folder(data_dir, args)?)?;
            Ok(json!({ "count": backups.len(), "items": backups }))
        }
        "restore" => Err(AppError::InvalidInput(
            "restoring a backup replaces everything on this device, so it is done in the app: Settings, Backup".into(),
        )),
        other => Err(AppError::InvalidInput(format!(
            "unknown backup command '{other}', expected now or list"
        ))),
    }
}
