//! Backup to a folder. One zip holds everything Nookly persists: a consistent
//! snapshot of `nookly.db` plus every other file in the app data folder
//! (stored files, recipe banners, bookmark previews, device preferences,
//! external calendar settings), so a restore brings back the whole app, not
//! only its notes. Caches that rebuild themselves (`office-previews`) are left out.
//!
//! Backups are written to a temporary name, verified end to end, and only then
//! renamed into place, so a folder never holds a half written backup under a
//! real name. Older backups are pruned only after a new one is verified.
//!
//! A restore never touches live data directly. `stage_restore` extracts and
//! checks the backup into `pending-restore/`, and the next launch runs
//! `apply_pending_restore` before the database opens. That moves the current
//! data into `restore-safety/<timestamp>/` (never deleted) and installs the
//! backup, rolling everything back if a step fails.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MANIFEST: &str = "manifest.json";
const DB_FILE: &str = "nookly.db";
const FORMAT_VERSION: u32 = 1;
const NAME_PREFIX: &str = "nookly-backup-";
const NAME_SUFFIX: &str = ".zip";
const PENDING_DIR: &str = "pending-restore";
const SAFETY_DIR: &str = "restore-safety";
const READY_MARKER: &str = "READY";
const RESTORE_ERROR_LOG: &str = "restore-error.log";

/// What a backup contains, stored as `manifest.json` inside it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub app_version: String,
    /// Number of migrations the snapshot had run.
    pub schema_version: usize,
    pub created_at: String,
    /// Files other than the database and the manifest.
    pub file_count: usize,
    /// Uncompressed size of everything in the backup.
    pub bytes: u64,
    /// Files added by reference. They stay where they are and are not copied.
    pub referenced_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub name: String,
    /// Size of the zip on disk.
    pub size: u64,
    /// Unset when the zip could not be read as a Nookly backup.
    pub manifest: Option<Manifest>,
}

/// What `snapshot` captured from the live database, ahead of the archive.
pub struct Snapshot {
    pub path: PathBuf,
    pub schema_version: usize,
    pub referenced_files: usize,
}

fn io_err(e: impl std::fmt::Display) -> AppError {
    AppError::Io(e.to_string())
}

/// Top level entries that are never backed up nor swapped by a restore: caches
/// that rebuild themselves, logs, and the restore machinery's own folders.
fn is_excluded(name: &str) -> bool {
    matches!(
        name,
        "office-previews" | "crash.log" | RESTORE_ERROR_LOG | PENDING_DIR | SAFETY_DIR
    ) || name.ends_with(".tmp")
        || name.ends_with(".partial")
}

/// The database and its journal and pre migration copies. Backed up as a
/// snapshot instead of file by file, since a live database can't be copied raw.
fn is_database_file(name: &str) -> bool {
    name.starts_with(DB_FILE)
}

/// Writes a consistent copy of the live database (`VACUUM INTO`) and checks it,
/// so a corrupt snapshot can never end up in a backup.
pub fn snapshot(conn: &Connection) -> AppResult<Snapshot> {
    let path = std::env::temp_dir().join(format!("nookly-snapshot-{}.db", crate::db::new_id()));
    conn.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()])?;
    let check = Connection::open(&path)
        .and_then(|c| c.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)));
    match check {
        Ok(result) if result == "ok" => {}
        other => {
            fs::remove_file(&path).ok();
            return Err(AppError::Db(format!(
                "the database snapshot failed its integrity check: {other:?}"
            )));
        }
    }
    let referenced_files = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE local_path IS NULL AND source_path IS NOT NULL",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
        .max(0) as usize;
    Ok(Snapshot {
        path,
        schema_version: crate::db::schema_version(conn)?,
        referenced_files,
    })
}

/// Formats and audio already compress, so storing them beats spending CPU.
fn compression_for(path: &Path) -> CompressionMethod {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some(
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "heic" | "avif" | "pdf" | "zip" | "mp4"
            | "mov" | "mkv" | "webm" | "mp3" | "m4a" | "aac" | "flac" | "ogg" | "docx" | "xlsx"
            | "pptx" | "epub",
        ) => CompressionMethod::Stored,
        _ => CompressionMethod::Deflated,
    }
}

fn zip_options(method: CompressionMethod) -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(method)
        .large_file(true)
}

/// Adds every backed up file under `dir`, returning `(count, bytes)`. Symlinks
/// are skipped so a link can never pull in data from outside the app folder.
fn add_tree(
    zip: &mut ZipWriter<File>,
    root: &Path,
    dir: &Path,
    skip_dir: Option<&Path>,
    totals: &mut (usize, u64),
) -> AppResult<()> {
    for entry in fs::read_dir(dir).map_err(io_err)? {
        let entry = entry.map_err(io_err)?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let at_root = dir == root;
        if at_root && (is_excluded(&name) || is_database_file(&name)) {
            continue;
        }
        let kind = entry.file_type().map_err(io_err)?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            // The destination folder may sit inside the app folder.
            if skip_dir.is_some_and(|skip| fs::canonicalize(&path).is_ok_and(|p| p == skip)) {
                continue;
            }
            add_tree(zip, root, &path, skip_dir, totals)?;
        } else if kind.is_file() {
            let relative = path.strip_prefix(root).map_err(io_err)?;
            let entry_name = relative
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            let mut file = match File::open(&path) {
                Ok(file) => file,
                // Removed since the listing; nothing to keep.
                Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
                Err(e) => return Err(io_err(format!("{}: {e}", path.display()))),
            };
            zip.start_file(entry_name, zip_options(compression_for(&path)))
                .map_err(io_err)?;
            let bytes = io::copy(&mut file, zip).map_err(io_err)?;
            totals.0 += 1;
            totals.1 += bytes;
        }
    }
    Ok(())
}

/// Reads every entry to its end, which makes the zip reader check each CRC, and
/// returns the manifest. A backup that passes has been read back byte for byte.
fn verify_archive(path: &Path) -> AppResult<Manifest> {
    let mut archive = ZipArchive::new(File::open(path).map_err(io_err)?).map_err(io_err)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(io_err)?;
        io::copy(&mut entry, &mut io::sink()).map_err(io_err)?;
    }
    let manifest = read_manifest(&mut archive)?;
    // Database and manifest come on top of the counted files.
    if archive.len() != manifest.file_count + 2 {
        return Err(AppError::Io(
            "the backup does not hold every file it should".into(),
        ));
    }
    Ok(manifest)
}

fn read_manifest(archive: &mut ZipArchive<File>) -> AppResult<Manifest> {
    let mut entry = archive
        .by_name(MANIFEST)
        .map_err(|_| AppError::InvalidInput("this is not a Nookly backup".into()))?;
    let mut text = String::new();
    entry.read_to_string(&mut text).map_err(io_err)?;
    serde_json::from_str(&text)
        .map_err(|_| AppError::InvalidInput("this is not a Nookly backup".into()))
}

fn backup_name(now: chrono::DateTime<chrono::Utc>) -> String {
    format!("{NAME_PREFIX}{}{NAME_SUFFIX}", now.format("%Y%m%d-%H%M%S"))
}

fn is_backup_name(name: &str) -> bool {
    name.starts_with(NAME_PREFIX) && name.ends_with(NAME_SUFFIX)
}

/// Writes the backup zip into `dest`, verifies it, then prunes so at most
/// `keep` remain. The snapshot file is removed whatever the outcome.
pub fn create_backup(
    snap: Snapshot,
    data_dir: &Path,
    dest: &Path,
    keep: usize,
) -> AppResult<BackupInfo> {
    let result = write_backup(&snap, data_dir, dest);
    fs::remove_file(&snap.path).ok();
    let final_path = result?;
    prune(dest, keep.max(1), &final_path);
    describe(&final_path)
}

fn write_backup(snap: &Snapshot, data_dir: &Path, dest: &Path) -> AppResult<PathBuf> {
    fs::create_dir_all(dest).map_err(io_err)?;
    let partial = dest.join(format!(".nookly-backup-{}.partial", crate::db::new_id()));
    let outcome = (|| {
        let mut zip = ZipWriter::new(File::create(&partial).map_err(io_err)?);
        let skip_dir = fs::canonicalize(dest).ok();

        let mut db = File::open(&snap.path).map_err(io_err)?;
        zip.start_file(DB_FILE, zip_options(CompressionMethod::Deflated))
            .map_err(io_err)?;
        let db_bytes = io::copy(&mut db, &mut zip).map_err(io_err)?;

        let mut totals = (0usize, db_bytes);
        add_tree(
            &mut zip,
            data_dir,
            data_dir,
            skip_dir.as_deref(),
            &mut totals,
        )?;

        let manifest = Manifest {
            format_version: FORMAT_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            schema_version: snap.schema_version,
            created_at: crate::db::now(),
            file_count: totals.0,
            bytes: totals.1,
            referenced_files: snap.referenced_files,
        };
        zip.start_file(MANIFEST, zip_options(CompressionMethod::Deflated))
            .map_err(io_err)?;
        zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(io_err)?)
            .map_err(io_err)?;
        zip.finish().map_err(io_err)?.sync_all().map_err(io_err)?;

        verify_archive(&partial)?;

        let mut target = dest.join(backup_name(chrono::Utc::now()));
        let mut n = 2;
        while target.exists() {
            let stem = backup_name(chrono::Utc::now());
            let stem = stem.trim_end_matches(NAME_SUFFIX);
            target = dest.join(format!("{stem}-{n}{NAME_SUFFIX}"));
            n += 1;
        }
        fs::rename(&partial, &target).map_err(io_err)?;
        Ok(target)
    })();
    if outcome.is_err() {
        fs::remove_file(&partial).ok();
    }
    outcome
}

/// Deletes the oldest of Nookly's own backups beyond `keep`, never `newest`.
fn prune(dest: &Path, keep: usize, newest: &Path) {
    let Ok(read) = fs::read_dir(dest) else { return };
    let mut names: Vec<String> = read
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| is_backup_name(n))
        .collect();
    // Timestamps in the names sort oldest first.
    names.sort();
    let excess = names.len().saturating_sub(keep);
    for name in names.into_iter().take(excess) {
        let path = dest.join(&name);
        if path != newest {
            fs::remove_file(path).ok();
        }
    }
}

fn describe(path: &Path) -> AppResult<BackupInfo> {
    let size = fs::metadata(path).map_err(io_err)?.len();
    let manifest = File::open(path)
        .ok()
        .and_then(|f| ZipArchive::new(f).ok())
        .and_then(|mut a| read_manifest(&mut a).ok());
    Ok(BackupInfo {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        size,
        manifest,
    })
}

/// Nookly's backups in `folder`, newest first. A missing folder holds none.
pub fn list_backups(folder: &Path) -> AppResult<Vec<BackupInfo>> {
    let read = match fs::read_dir(folder) {
        Ok(read) => read,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(io_err(e)),
    };
    let mut paths: Vec<PathBuf> = read
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter(|e| is_backup_name(&e.file_name().to_string_lossy()))
        .map(|e| e.path())
        .collect();
    paths.sort();
    paths.reverse();
    paths.iter().map(|p| describe(p)).collect()
}

/// Reads a backup's manifest, checking the zip end to end and that this build
/// can restore it.
pub fn inspect_backup(archive: &Path) -> AppResult<Manifest> {
    let manifest = verify_archive(archive)?;
    if manifest.format_version > FORMAT_VERSION
        || manifest.schema_version > crate::db::latest_schema_version()
    {
        return Err(AppError::InvalidInput(format!(
            "this backup was made by a newer version of Nookly (v{}). Update Nookly, then restore it.",
            manifest.app_version
        )));
    }
    Ok(manifest)
}

/// Extracts and checks `archive` into `pending-restore/`, ready for the next
/// launch to install. Live data is not touched.
pub fn stage_restore(data_dir: &Path, archive: &Path) -> AppResult<Manifest> {
    let manifest = inspect_backup(archive)?;
    let pending = data_dir.join(PENDING_DIR);
    // Only ever a leftover of an earlier staging, never live data.
    if pending.exists() {
        fs::remove_dir_all(&pending).map_err(io_err)?;
    }
    fs::create_dir_all(&pending).map_err(io_err)?;
    let staged = extract(archive, &pending).and_then(|()| check_staged(&pending, &manifest));
    if let Err(e) = staged {
        fs::remove_dir_all(&pending).ok();
        return Err(e);
    }
    fs::write(
        pending.join(MANIFEST),
        serde_json::to_vec_pretty(&manifest).map_err(io_err)?,
    )
    .map_err(io_err)?;
    // Written last: without it, a staging cut short is discarded, never installed.
    fs::write(pending.join(READY_MARKER), b"").map_err(io_err)?;
    Ok(manifest)
}

fn extract(archive: &Path, into: &Path) -> AppResult<()> {
    let mut zip = ZipArchive::new(File::open(archive).map_err(io_err)?).map_err(io_err)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(io_err)?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| AppError::InvalidInput("the backup holds an unsafe path".into()))?;
        let top = relative
            .components()
            .next()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .unwrap_or_default();
        if relative == Path::new(MANIFEST) {
            continue;
        }
        if is_excluded(&top) {
            return Err(AppError::InvalidInput(
                "the backup holds a path Nookly never writes".into(),
            ));
        }
        let target = into.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(io_err)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(io_err)?;
        }
        let mut out = File::create(&target).map_err(io_err)?;
        io::copy(&mut entry, &mut out).map_err(io_err)?;
        out.sync_all().map_err(io_err)?;
    }
    Ok(())
}

/// The staged database must open, pass an integrity check and match the
/// manifest before anything is allowed to replace live data.
fn check_staged(pending: &Path, manifest: &Manifest) -> AppResult<()> {
    let db = pending.join(DB_FILE);
    if !db.is_file() {
        return Err(AppError::InvalidInput("the backup has no database".into()));
    }
    let conn = Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let result: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if result != "ok" {
        return Err(AppError::Db(format!(
            "the backup's database is damaged: {result}"
        )));
    }
    if crate::db::schema_version(&conn)? != manifest.schema_version {
        return Err(AppError::InvalidInput(
            "the backup's database does not match its manifest".into(),
        ));
    }
    Ok(())
}

/// Installs a staged restore, if one is ready. Runs at launch before the
/// database opens. Current data moves into `restore-safety/<timestamp>/` and is
/// never deleted. Returns that folder when a restore was applied. On any
/// failure every move is undone, so the data is exactly as it was.
pub fn apply_pending_restore(data_dir: &Path) -> AppResult<Option<PathBuf>> {
    let pending = data_dir.join(PENDING_DIR);
    if !pending.is_dir() {
        return Ok(None);
    }
    if !pending.join(READY_MARKER).is_file() {
        // Staging was cut short; nothing was installed.
        fs::remove_dir_all(&pending).ok();
        return Ok(None);
    }

    let safety = data_dir
        .join(SAFETY_DIR)
        .join(chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string());
    fs::create_dir_all(&safety).map_err(io_err)?;

    let names = |dir: &Path, skip: &dyn Fn(&str) -> bool| -> AppResult<Vec<String>> {
        Ok(fs::read_dir(dir)
            .map_err(io_err)?
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| !skip(n))
            .collect())
    };
    let live = names(data_dir, &is_excluded)?;
    let incoming = names(&pending, &|n| n == MANIFEST || n == READY_MARKER)?;

    let mut set_aside: Vec<&String> = Vec::new();
    let mut installed: Vec<&String> = Vec::new();
    let outcome = (|| -> io::Result<()> {
        for name in &live {
            fs::rename(data_dir.join(name), safety.join(name))?;
            set_aside.push(name);
        }
        for name in &incoming {
            fs::rename(pending.join(name), data_dir.join(name))?;
            installed.push(name);
        }
        Ok(())
    })();

    match outcome {
        Ok(()) => {
            fs::remove_dir_all(&pending).ok();
            Ok(Some(safety))
        }
        Err(e) => {
            for name in installed.iter().rev() {
                fs::rename(data_dir.join(name), pending.join(name)).ok();
            }
            for name in set_aside.iter().rev() {
                fs::rename(safety.join(name), data_dir.join(name)).ok();
            }
            fs::remove_dir(&safety).ok();
            // Left in place, a failing restore would retry on every launch.
            fs::remove_dir_all(&pending).ok();
            Err(io_err(e))
        }
    }
}

/// Records a failed launch time restore where the user can find it.
pub fn log_restore_error(data_dir: &Path, error: &AppError) {
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join(RESTORE_ERROR_LOG))
    {
        let _ = writeln!(
            f,
            "[{}] restore failed, your data was left as it was: {error}",
            crate::db::now()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nookly-{label}-{}", db::new_id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn space_names(dir: &Path) -> Vec<String> {
        let conn = db::connect(dir).unwrap();
        db::spaces::list_spaces(&conn)
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect()
    }

    /// A data folder with a space, stored files and the things a backup skips.
    fn populated(space: &str) -> PathBuf {
        let dir = scratch("data");
        let conn = db::connect(&dir).unwrap();
        db::spaces::create_space(&conn, space.into(), None, "#000".into()).unwrap();
        drop(conn);
        fs::create_dir_all(dir.join("files")).unwrap();
        fs::write(dir.join("files/a.pdf"), b"pdf bytes").unwrap();
        fs::create_dir_all(dir.join("recipe-banners")).unwrap();
        fs::write(dir.join("recipe-banners/b.png"), b"png bytes").unwrap();
        fs::create_dir_all(dir.join("bookmark-previews")).unwrap();
        fs::write(dir.join("bookmark-previews/c.jpg"), b"jpg bytes").unwrap();
        fs::write(dir.join("preferences.json"), b"{\"nookly:theme\":\"dark\"}").unwrap();
        fs::write(dir.join("external-calendars.json"), b"{}").unwrap();
        fs::create_dir_all(dir.join("office-previews")).unwrap();
        fs::write(dir.join("office-previews/skip.pdf"), b"cache").unwrap();
        fs::write(dir.join("crash.log"), b"log").unwrap();
        dir
    }

    fn backup_of(dir: &Path, dest: &Path, keep: usize) -> BackupInfo {
        let conn = db::connect(dir).unwrap();
        let snap = snapshot(&conn).unwrap();
        create_backup(snap, dir, dest, keep).unwrap()
    }

    #[test]
    fn restores_the_database_and_every_file() {
        let source = populated("Own");
        let dest = scratch("dest");
        let info = backup_of(&source, &dest, 10);
        let manifest = info.manifest.clone().unwrap();
        // files, recipe banner, bookmark preview, preferences, calendars.
        assert_eq!(manifest.file_count, 5);

        let target = populated("Old");
        fs::write(target.join("files/old-only.pdf"), b"old").unwrap();
        stage_restore(&target, Path::new(&info.path)).unwrap();
        let safety = apply_pending_restore(&target).unwrap().unwrap();

        assert_eq!(space_names(&target), vec!["Own"]);
        for file in [
            "files/a.pdf",
            "recipe-banners/b.png",
            "bookmark-previews/c.jpg",
            "preferences.json",
            "external-calendars.json",
        ] {
            assert!(target.join(file).is_file(), "{file} restored");
        }
        assert!(!target.join("files/old-only.pdf").exists());
        assert!(!target.join(PENDING_DIR).exists());
        // The replaced data is kept, database included.
        assert!(safety.join("files/old-only.pdf").is_file());
        assert!(safety.join(DB_FILE).is_file());

        for dir in [source, dest, target] {
            fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn leaves_caches_and_logs_out() {
        let source = populated("Own");
        let dest = scratch("dest");
        let info = backup_of(&source, &dest, 10);
        let mut zip = ZipArchive::new(File::open(&info.path).unwrap()).unwrap();
        let names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(names.iter().all(|n| !n.starts_with("office-previews")));
        assert!(!names.iter().any(|n| n == "crash.log"));
        assert!(names.iter().any(|n| n == DB_FILE));
        for dir in [source, dest] {
            fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn a_backup_inside_the_data_folder_is_not_backed_up_again() {
        let source = populated("Own");
        let dest = source.join("my-backups");
        let first = backup_of(&source, &dest, 10);
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let second = backup_of(&source, &dest, 10);
        assert_eq!(
            first.manifest.unwrap().file_count,
            second.manifest.unwrap().file_count
        );
        fs::remove_dir_all(source).ok();
    }

    #[test]
    fn keeps_only_the_newest_backups() {
        let source = populated("Own");
        let dest = scratch("dest");
        for stamp in ["20200101-000000", "20200102-000000", "20200103-000000"] {
            fs::write(
                dest.join(format!("{NAME_PREFIX}{stamp}{NAME_SUFFIX}")),
                b"x",
            )
            .unwrap();
        }
        fs::write(dest.join("unrelated.zip"), b"mine").unwrap();
        let info = backup_of(&source, &dest, 2);
        let names: Vec<String> = list_backups(&dest)
            .unwrap()
            .into_iter()
            .map(|b| b.name)
            .collect();
        assert_eq!(names.len(), 2);
        assert_eq!(names[0], info.name);
        assert!(dest.join("unrelated.zip").is_file());
        for dir in [source, dest] {
            fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn refuses_a_backup_from_a_newer_schema() {
        let source = populated("Own");
        let dest = scratch("dest");
        let mut snap = {
            let conn = db::connect(&source).unwrap();
            snapshot(&conn).unwrap()
        };
        snap.schema_version = db::latest_schema_version() + 1;
        let info = create_backup(snap, &source, &dest, 10).unwrap();

        let target = populated("Keep");
        let err = stage_restore(&target, Path::new(&info.path)).unwrap_err();
        assert!(err.to_string().contains("newer version"));
        assert!(!target.join(PENDING_DIR).exists());
        assert_eq!(space_names(&target), vec!["Keep"]);
        for dir in [source, dest, target] {
            fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn refuses_paths_that_escape_the_data_folder() {
        let dest = scratch("dest");
        let evil = dest.join("evil.zip");
        let mut zip = ZipWriter::new(File::create(&evil).unwrap());
        let opts = zip_options(CompressionMethod::Stored);
        zip.start_file("../escaped.txt", opts).unwrap();
        zip.write_all(b"x").unwrap();
        zip.start_file(DB_FILE, opts).unwrap();
        zip.write_all(b"x").unwrap();
        let manifest = Manifest {
            format_version: FORMAT_VERSION,
            app_version: "0".into(),
            schema_version: 1,
            created_at: db::now(),
            file_count: 1,
            bytes: 2,
            referenced_files: 0,
        };
        zip.start_file(MANIFEST, opts).unwrap();
        zip.write_all(&serde_json::to_vec(&manifest).unwrap())
            .unwrap();
        zip.finish().unwrap();

        let target = populated("Keep");
        assert!(stage_restore(&target, &evil).is_err());
        assert!(!target.parent().unwrap().join("escaped.txt").exists());
        assert_eq!(space_names(&target), vec!["Keep"]);
        for dir in [dest, target] {
            fs::remove_dir_all(dir).ok();
        }
    }

    #[test]
    fn staging_cut_short_is_discarded_not_installed() {
        let target = populated("Keep");
        let pending = target.join(PENDING_DIR);
        fs::create_dir_all(&pending).unwrap();
        fs::write(pending.join(DB_FILE), b"half written").unwrap();
        assert!(apply_pending_restore(&target).unwrap().is_none());
        assert!(!pending.exists());
        assert_eq!(space_names(&target), vec!["Keep"]);
        fs::remove_dir_all(target).ok();
    }
}
