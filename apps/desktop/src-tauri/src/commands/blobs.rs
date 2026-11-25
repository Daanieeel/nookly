//! File contents between this device and the account's storage, for the shared
//! `BlobSync` (`packages/shared/src/sync/blobs.ts`). Hashing, uploads and downloads
//! run here, streaming from and to disk, so a large file never crosses the IPC
//! bridge or sits in memory. Every download is checked against its SHA-256 before
//! anything points at it; a file that doesn't match is thrown away.

use crate::backup::{self, BackupInfo};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct BlobHash {
    pub sha256: String,
    pub size: u64,
}

fn io_err(e: impl std::fmt::Display) -> AppError {
    AppError::Io(e.to_string())
}

fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(crate::db::resolve_app_data_dir(
        app.path().app_data_dir().map_err(io_err)?,
    ))
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(io_err)?
}

fn valid_sha(sha256: &str) -> AppResult<()> {
    let ok = sha256.len() == 64
        && sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    if ok {
        Ok(())
    } else {
        Err(AppError::InvalidInput("not a SHA-256".into()))
    }
}

/// Hashes a file as it streams from disk. `None` when it is missing.
pub fn hash_file(path: &Path) -> AppResult<Option<BlobHash>> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(io_err(e)),
    };
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer).map_err(io_err)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    Ok(Some(BlobHash {
        sha256: hex(&hasher.finalize()),
        size,
    }))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn token() -> AppResult<String> {
    crate::sync::secrets::get()?.ok_or_else(|| AppError::Remote("Sign in to sync first.".into()))
}

fn blob_url(server_url: &str, sha256: &str) -> String {
    format!("{}/v1/blobs/{sha256}", server_url.trim_end_matches('/'))
}

fn remote_error(response: reqwest::blocking::Response) -> AppError {
    let status = response.status();
    let message = response
        .json::<serde_json::Value>()
        .ok()
        .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
        .unwrap_or_else(|| format!("The server answered {status}."));
    AppError::Remote(message)
}

fn client() -> AppResult<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(None)
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(io_err)
}

/// Sends a file's contents, streamed from disk. The server checks them against
/// `sha256` and keeps nothing that doesn't match, so a retry is always safe.
pub fn upload_file(
    server_url: &str,
    sha256: &str,
    path: &Path,
    content_type: &str,
) -> AppResult<()> {
    valid_sha(sha256)?;
    let file = File::open(path).map_err(io_err)?;
    let size = file.metadata().map_err(io_err)?.len();
    let response = client()?
        .put(blob_url(server_url, sha256))
        .bearer_auth(token()?)
        .header("content-type", content_type)
        .body(reqwest::blocking::Body::sized(file, size))
        .send()
        .map_err(|e| AppError::Remote(format!("Couldn't reach the server: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(remote_error(response))
    }
}

/// Where Nookly keeps the files it owns, under the data folder.
const STORED_FOLDERS: [&str; 3] = ["files", "recipe-banners", "bookmark-previews"];

/// Deletes a stored file the account holds, when the device signs out. Only a plain
/// file inside Nookly's own folders (never one a File merely points at elsewhere, nor a
/// link) that still holds exactly `sha256` goes. Whether it was deleted.
pub fn remove_stored(data_dir: &Path, path: &Path, sha256: &str) -> AppResult<bool> {
    valid_sha(sha256)?;
    let plain = fs::symlink_metadata(path).is_ok_and(|m| m.is_file());
    if !plain {
        return Ok(false);
    }
    let resolved = fs::canonicalize(path).map_err(io_err)?;
    let owned = STORED_FOLDERS.iter().any(|folder| {
        fs::canonicalize(data_dir.join(folder)).is_ok_and(|dir| resolved.starts_with(dir))
    });
    if !owned || hash_file(&resolved)?.is_none_or(|h| h.sha256 != sha256) {
        return Ok(false);
    }
    fs::remove_file(&resolved).map_err(io_err)?;
    Ok(true)
}

/// A file name safe to store: its last part, without separators or a leading dot.
fn safe_name(filename: &str) -> String {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or("file");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != ':')
        .collect::<String>()
        .trim_start_matches('.')
        .to_string();
    if cleaned.is_empty() {
        "file".into()
    } else {
        cleaned
    }
}

/// Downloads contents into `dir`, checking them against `sha256` on the way, and
/// returns where they landed. A body that doesn't match is deleted, never used.
pub fn download_to(
    server_url: &str,
    sha256: &str,
    dir: &Path,
    filename: &str,
) -> AppResult<PathBuf> {
    valid_sha(sha256)?;
    fs::create_dir_all(dir).map_err(io_err)?;
    let mut response = client()?
        .get(blob_url(server_url, sha256))
        .bearer_auth(token()?)
        .send()
        .map_err(|e| AppError::Remote(format!("Couldn't reach the server: {e}")))?;
    if !response.status().is_success() {
        return Err(remote_error(response));
    }
    let partial = dir.join(format!(".{sha256}.partial"));
    let outcome = (|| {
        let mut out = File::create(&partial).map_err(io_err)?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 256 * 1024];
        loop {
            let read = response.read(&mut buffer).map_err(io_err)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            out.write_all(&buffer[..read]).map_err(io_err)?;
        }
        out.sync_all().map_err(io_err)?;
        if hex(&hasher.finalize()) != sha256 {
            return Err(AppError::Remote(
                "The file changed on the way. It will be downloaded again.".into(),
            ));
        }
        let target = dir.join(format!("{}-{}", &sha256[..12], safe_name(filename)));
        fs::rename(&partial, &target).map_err(io_err)?;
        Ok(target)
    })();
    if outcome.is_err() {
        fs::remove_file(&partial).ok();
    }
    outcome
}

#[tauri::command]
pub async fn blob_hash(path: String) -> AppResult<Option<BlobHash>> {
    blocking(move || hash_file(Path::new(&path))).await
}

#[tauri::command]
pub async fn blob_upload(
    server_url: String,
    sha256: String,
    path: String,
    content_type: String,
) -> AppResult<()> {
    blocking(move || upload_file(&server_url, &sha256, Path::new(&path), &content_type)).await
}

#[tauri::command]
pub async fn blob_remove(app: AppHandle, path: String, sha256: String) -> AppResult<bool> {
    let dir = data_dir(&app)?;
    blocking(move || remove_stored(&dir, Path::new(&path), &sha256)).await
}

/// Downloads contents synced from another device and points the row at them:
/// a File's stored copy, a recipe's banner or a bookmark's snapshot. The copy
/// it had before stays on disk.
#[tauri::command]
pub async fn blob_download(
    app: AppHandle,
    server_url: String,
    sha256: String,
    table: String,
    pk: String,
    filename: String,
) -> AppResult<String> {
    let folder = match table.as_str() {
        "files" => "files",
        "recipes" => "recipe-banners",
        "bookmarks" => "bookmark-previews",
        _ => return Err(AppError::InvalidInput(format!("no files in {table}"))),
    };
    let dir = data_dir(&app)?.join(folder);
    let path = blocking(move || download_to(&server_url, &sha256, &dir, &filename)).await?;
    let path = path.to_string_lossy().into_owned();
    let state = app.state::<DbState>();
    let conn = state.conn()?;
    match table.as_str() {
        "files" => crate::db::files::attach_synced(&conn, &pk, &path)?,
        "recipes" => {
            conn.execute(
                "UPDATE recipes SET banner_path = ?1 WHERE entity_id = ?2",
                rusqlite::params![path, pk],
            )?;
        }
        _ => {
            conn.execute(
                "UPDATE bookmarks SET screenshot_path = ?1 WHERE entity_id = ?2",
                rusqlite::params![path, pk],
            )?;
        }
    }
    Ok(path)
}

/// The full backup made before a first sign in sends anything, in the app data
/// folder (`pre-sync-backups`), checked end to end like every backup. The three
/// newest are kept. With `keep` it holds the only copy of something (data kept out of
/// an account, changes that never reached it): it goes to `kept-backups`, where none
/// is ever removed.
#[tauri::command]
pub async fn create_pre_sync_backup(app: AppHandle, keep: Option<bool>) -> AppResult<BackupInfo> {
    let data_dir = data_dir(&app)?;
    let (folder, count) = if keep.unwrap_or(false) {
        (backup::KEPT_DIR, usize::MAX)
    } else {
        (backup::PRE_SYNC_DIR, 3)
    };
    blocking(move || {
        let snapshot = {
            let state = app.state::<DbState>();
            let conn = state.conn()?;
            backup::snapshot(&conn)?
        };
        let dest = data_dir.join(folder);
        backup::create_backup(snapshot, &data_dir, &dest, count)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_a_file_as_it_streams() {
        let dir = std::env::temp_dir().join(format!("nookly-blob-{}", crate::db::new_id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.txt");
        fs::write(&path, b"lecture one").unwrap();
        let hash = hash_file(&path).unwrap().unwrap();
        assert_eq!(hash.size, 11);
        assert_eq!(hash.sha256, hex(&Sha256::digest(b"lecture one")));
        assert!(hash_file(&dir.join("missing")).unwrap().is_none());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn removes_only_its_own_unchanged_files() {
        let root = std::env::temp_dir().join(format!("nookly-remove-{}", crate::db::new_id()));
        let data = root.join("data");
        let files = data.join("files");
        fs::create_dir_all(&files).unwrap();
        let sha = hex(&Sha256::digest(b"lecture"));

        let stored = files.join("a.pdf");
        fs::write(&stored, b"lecture").unwrap();
        assert!(remove_stored(&data, &stored, &sha).unwrap());
        assert!(!stored.exists());
        assert!(
            !remove_stored(&data, &stored, &sha).unwrap(),
            "already gone"
        );

        let edited = files.join("b.pdf");
        fs::write(&edited, b"edited since").unwrap();
        assert!(!remove_stored(&data, &edited, &sha).unwrap());
        assert!(edited.exists());

        // A File that only points at the person's own copy, directly or through `..`.
        let outside = root.join("mine.pdf");
        fs::write(&outside, b"lecture").unwrap();
        assert!(!remove_stored(&data, &outside, &sha).unwrap());
        assert!(!remove_stored(&data, &files.join("../../mine.pdf"), &sha).unwrap());
        assert!(outside.exists());

        #[cfg(unix)]
        {
            let link = files.join("link.pdf");
            std::os::unix::fs::symlink(&outside, &link).unwrap();
            assert!(!remove_stored(&data, &link, &sha).unwrap());
            assert!(outside.exists());
        }

        // The database is not a stored file.
        let database = data.join("nookly.db");
        fs::write(&database, b"lecture").unwrap();
        assert!(!remove_stored(&data, &database, &sha).unwrap());
        assert!(database.exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn stores_only_a_plain_file_name() {
        assert_eq!(safe_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_name("C:\\Users\\a\\notes.pdf"), "notes.pdf");
        assert_eq!(safe_name(".hidden"), "hidden");
        assert_eq!(safe_name(""), "file");
    }

    #[test]
    fn refuses_what_isnt_a_hash() {
        assert!(valid_sha("abc").is_err());
        assert!(valid_sha(&"A".repeat(64)).is_err());
        assert!(valid_sha(&"a".repeat(64)).is_ok());
    }
}
