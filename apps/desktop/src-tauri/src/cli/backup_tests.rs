//! `nookly cli backup`, against a temporary data folder and backup folder.

use super::backup::{command, BACKUP_KEEP};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// A temporary folder, removed on drop.
struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("nookly-cli-backup-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn run(
    conn: &rusqlite::Connection,
    data: &Path,
    args: &[&str],
) -> Result<Value, crate::error::AppError> {
    command(
        conn,
        data,
        &args.iter().map(|a| a.to_string()).collect::<Vec<_>>(),
    )
}

#[test]
fn backs_up_into_the_folder_from_settings_and_lists_it() {
    let conn = crate::db::test_conn();
    let data = TempDir::new();
    let folder = TempDir::new();
    // No folder yet: it says how to set one, and writes nothing.
    let none = run(&conn, data.path(), &["now"]).unwrap_err();
    assert!(none.to_string().contains("backup.folder"));
    std::fs::write(
        data.path().join("settings.json"),
        serde_json::json!({ "backup.folder": folder.path() }).to_string(),
    )
    .unwrap();
    let made = run(&conn, data.path(), &["now"]).unwrap();
    assert!(made["path"]
        .as_str()
        .unwrap()
        .starts_with(folder.path().to_str().unwrap()));
    let listed = run(&conn, data.path(), &["list"]).unwrap();
    assert_eq!(listed["count"], 1);
}

#[test]
fn takes_a_folder_of_its_own() {
    let conn = crate::db::test_conn();
    let data = TempDir::new();
    let folder = TempDir::new();
    let path = folder.path().to_str().unwrap();
    run(&conn, data.path(), &["now", "--folder", path]).unwrap();
    assert_eq!(
        run(&conn, data.path(), &["list", "--folder", path]).unwrap()["count"],
        1
    );
}

#[test]
fn has_no_restore_which_replaces_everything() {
    let conn = crate::db::test_conn();
    let data = TempDir::new();
    let err = run(&conn, data.path(), &["restore"]).unwrap_err();
    assert!(err.to_string().contains("app"));
}

// The app keeps this many backups (`BACKUP_KEEP` in `lib/api/backup.ts`); the CLI keeps
// the same, so a backup made here never prunes more than one made there.
#[test]
fn keeps_as_many_backups_as_the_app() {
    let source = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/frontend/src/lib/api/backup.ts"
    ))
    .unwrap();
    assert!(source.contains(&format!("BACKUP_KEEP = {BACKUP_KEEP};")));
}
