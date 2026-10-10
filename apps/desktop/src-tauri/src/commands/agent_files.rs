//! Plain markdown files the user keeps for their own coding agent, in `<app data>/agent/`.
//! Nookly never reads them or talks to an AI: this is file management only. The folder
//! starts with an `AGENTS.md` and holds whatever other `.md` files the user adds.
//!
//! The logic takes the folder as a parameter so tests run against a temp folder. The
//! commands at the bottom only resolve it from the app handle.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The file coding agents open first. Always present, never deleted.
const ENTRY_FILE: &str = "AGENTS.md";
const TRASH_DIR: &str = ".trash";
const MAX_NAME_LEN: usize = 100;
const MAX_CONTENT_BYTES: usize = 1024 * 1024;

const STARTER: &str = "# Agent instructions

## Who you are

Describe the role you want your coding agent to play and who it works for.

## Files in this folder

List the other files here and when the agent should read them.

## Working inside Nookly

- Use the `nookly` CLI only. Never touch the database or the app's files directly.
- Ask for JSON output so results are easy to read.
- Deletions go to Trash and can be restored. Ask before deleting anything.
- Ask before making big changes, such as many edits at once.
- Run `nookly describe` to list every command, entity type and field.
";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentFile {
    pub name: String,
    pub size: u64,
    /// RFC 3339, empty when the platform reports no modified time.
    pub modified: String,
}

/// A name is a plain `.md` file name: no folders, no hidden files, no `..`.
pub fn validate_name(name: &str) -> AppResult<()> {
    let first_ok = name
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric());
    let chars_ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ' ' | '-'));
    if name.len() > MAX_NAME_LEN
        || !name.ends_with(".md")
        || !first_ok
        || !chars_ok
        || name.contains("..")
    {
        return Err(AppError::InvalidInput(format!(
            "\"{name}\" is not a valid file name. Use letters, numbers, spaces, dots, dashes or underscores and end with .md"
        )));
    }
    Ok(())
}

/// Creates the folder, and the starter `AGENTS.md` only when there is none. An existing
/// file is never opened for writing.
pub fn ensure_dir(dir: &Path) -> AppResult<()> {
    fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join(ENTRY_FILE))
    {
        Ok(mut file) => file
            .write_all(STARTER.as_bytes())
            .map_err(|e| AppError::Io(e.to_string())),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(AppError::Io(e.to_string())),
    }
}

pub fn list(dir: &Path) -> AppResult<Vec<AgentFile>> {
    ensure_dir(dir)?;
    let mut files = Vec::new();
    for entry in fs::read_dir(dir)
        .map_err(|e| AppError::Io(e.to_string()))?
        .flatten()
    {
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() || validate_name(&name).is_err() {
            continue;
        }
        let modified = meta
            .modified()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_default();
        files.push(AgentFile {
            name,
            size: meta.len(),
            modified,
        });
    }
    // The entry file leads, the rest read alphabetically.
    files.sort_by_key(|f| (f.name != ENTRY_FILE, f.name.to_lowercase()));
    Ok(files)
}

pub fn read(dir: &Path, name: &str) -> AppResult<String> {
    validate_name(name)?;
    ensure_dir(dir)?;
    fs::read_to_string(dir.join(name)).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => AppError::NotFound(name.to_string()),
        _ => AppError::Io(e.to_string()),
    })
}

/// Writes through a temp file in the same folder and renames it into place, so the
/// file is either the old content or the new content, never half of each.
pub fn write(dir: &Path, name: &str, content: &str) -> AppResult<()> {
    validate_name(name)?;
    if content.len() > MAX_CONTENT_BYTES {
        return Err(AppError::InvalidInput(
            "this file is over the 1 MB limit".into(),
        ));
    }
    ensure_dir(dir)?;
    let temp = dir.join(format!(".{name}.tmp-{}", crate::db::new_id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, dir.join(name))
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(AppError::Io(e.to_string()));
    }
    Ok(())
}

/// Moves the file to `.trash/<timestamp>-<name>` so a delete can always be undone by
/// hand. The entry file cannot be deleted.
pub fn delete(dir: &Path, name: &str) -> AppResult<()> {
    validate_name(name)?;
    if name.eq_ignore_ascii_case(ENTRY_FILE) {
        return Err(AppError::InvalidInput(format!(
            "{ENTRY_FILE} is the entry file and cannot be deleted"
        )));
    }
    let source = dir.join(name);
    if !source.is_file() {
        return Err(AppError::NotFound(name.to_string()));
    }
    let trash = dir.join(TRASH_DIR);
    fs::create_dir_all(&trash).map_err(|e| AppError::Io(e.to_string()))?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S%3f");
    let mut target = trash.join(format!("{stamp}-{name}"));
    let mut n = 1;
    // `rename` replaces an existing file, and the trash must never lose one.
    while target.exists() {
        target = trash.join(format!("{stamp}-{n}-{name}"));
        n += 1;
    }
    fs::rename(&source, &target).map_err(|e| AppError::Io(e.to_string()))
}

fn agent_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(crate::db::resolve_app_data_dir(base).join("agent"))
}

/// The folder to hand to a coding agent. Created on the way, with its starter file.
#[tauri::command]
pub fn agent_dir_path(app: AppHandle) -> AppResult<String> {
    let dir = agent_dir(&app)?;
    ensure_dir(&dir)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_agent_files(app: AppHandle) -> AppResult<Vec<AgentFile>> {
    list(&agent_dir(&app)?)
}

#[tauri::command]
pub fn read_agent_file(app: AppHandle, name: String) -> AppResult<String> {
    read(&agent_dir(&app)?, &name)
}

#[tauri::command]
pub fn write_agent_file(app: AppHandle, name: String, content: String) -> AppResult<()> {
    write(&agent_dir(&app)?, &name, &content)
}

#[tauri::command]
pub fn delete_agent_file(app: AppHandle, name: String) -> AppResult<()> {
    delete(&agent_dir(&app)?, &name)
}

/// Shows the folder in Finder (or the platform's file manager).
#[tauri::command]
pub fn reveal_agent_dir(app: AppHandle) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = agent_dir(&app)?;
    ensure_dir(&dir)?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("nookly-agent-files-{}", crate::db::new_id()))
    }

    #[test]
    fn names_must_be_plain_markdown_files() {
        for bad in [
            "../x.md",
            "a/b.md",
            "a\\b.md",
            "x.txt",
            "x",
            ".hidden.md",
            "..md",
            "a..b.md",
            "",
            " x.md",
        ] {
            assert!(validate_name(bad).is_err(), "{bad:?} should be rejected");
        }
        assert!(validate_name(&format!("{}.md", "a".repeat(98))).is_err());
        for good in [
            "AGENTS.md",
            "PROFILE.md",
            "my notes.md",
            "style-v2_final.md",
            "a.b.md",
        ] {
            assert!(validate_name(good).is_ok(), "{good:?} should be accepted");
        }
    }

    #[test]
    fn listing_creates_the_folder_with_a_starter_entry_file() {
        let dir = temp_dir();
        let files = list(&dir).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "AGENTS.md");
        let starter = read(&dir, "AGENTS.md").unwrap();
        assert!(starter.contains("Working inside Nookly"));
        assert!(starter.contains("Who you are"));
        assert!(starter.contains("Files in this folder"));
    }

    #[test]
    fn an_existing_entry_file_is_never_overwritten() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("AGENTS.md"), "mine").unwrap();
        list(&dir).unwrap();
        ensure_dir(&dir).unwrap();
        assert_eq!(read(&dir, "AGENTS.md").unwrap(), "mine");
    }

    #[test]
    fn write_then_read_round_trips_and_leaves_no_temp_file() {
        let dir = temp_dir();
        write(&dir, "PROFILE.md", "I study physics.").unwrap();
        write(&dir, "PROFILE.md", "I study physics and maths.").unwrap();
        assert_eq!(
            read(&dir, "PROFILE.md").unwrap(),
            "I study physics and maths."
        );
        let names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert!(names.iter().all(|n| !n.contains(".tmp-")), "{names:?}");
    }

    #[test]
    fn writes_over_the_size_cap_or_to_bad_names_change_nothing() {
        let dir = temp_dir();
        write(&dir, "A.md", "keep").unwrap();
        assert!(write(&dir, "A.md", &"x".repeat(MAX_CONTENT_BYTES + 1)).is_err());
        assert!(write(&dir, "../A.md", "x").is_err());
        assert_eq!(read(&dir, "A.md").unwrap(), "keep");
    }

    #[test]
    fn reading_a_missing_file_is_not_found() {
        let dir = temp_dir();
        assert!(matches!(read(&dir, "NOPE.md"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn listing_shows_only_markdown_files_with_the_entry_file_first() {
        let dir = temp_dir();
        write(&dir, "zeta.md", "z").unwrap();
        write(&dir, "Alpha.md", "a").unwrap();
        fs::write(dir.join("notes.txt"), "no").unwrap();
        fs::create_dir_all(dir.join("folder.md")).unwrap();
        let names: Vec<String> = list(&dir).unwrap().into_iter().map(|f| f.name).collect();
        assert_eq!(names, ["AGENTS.md", "Alpha.md", "zeta.md"]);
    }

    #[test]
    fn delete_moves_the_file_to_the_trash_folder() {
        let dir = temp_dir();
        write(&dir, "STYLE.md", "short sentences").unwrap();
        delete(&dir, "STYLE.md").unwrap();
        assert!(matches!(read(&dir, "STYLE.md"), Err(AppError::NotFound(_))));
        let trashed: Vec<PathBuf> = fs::read_dir(dir.join(TRASH_DIR))
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();
        assert_eq!(trashed.len(), 1);
        assert!(trashed[0].to_string_lossy().ends_with("-STYLE.md"));
        assert_eq!(fs::read_to_string(&trashed[0]).unwrap(), "short sentences");
        // The trash is not part of the list.
        assert!(list(&dir).unwrap().iter().all(|f| f.name != "STYLE.md"));
    }

    #[test]
    fn deleting_twice_keeps_both_copies_and_the_entry_file_is_protected() {
        let dir = temp_dir();
        for content in ["first", "second"] {
            write(&dir, "X.md", content).unwrap();
            delete(&dir, "X.md").unwrap();
        }
        assert_eq!(fs::read_dir(dir.join(TRASH_DIR)).unwrap().count(), 2);
        ensure_dir(&dir).unwrap();
        assert!(delete(&dir, "AGENTS.md").is_err());
        assert!(delete(&dir, "agents.md").is_err());
        assert!(dir.join("AGENTS.md").is_file());
        assert!(matches!(
            delete(&dir, "GONE.md"),
            Err(AppError::NotFound(_))
        ));
    }
}
