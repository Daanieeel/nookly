//! Plain markdown files the user keeps for their own coding agent, in `<app data>/agent/`.
//! Nookly never reads them or talks to an AI: this is file management only. The folder
//! starts with an `AGENTS.md` and a `NOOKLY.md` guide, and holds whatever other `.md` files
//! the user adds, optionally inside folders (up to `MAX_DEPTH` levels).
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
/// Folder levels plus the file itself, so `a/b/c/d/file.md` is the deepest path.
const MAX_DEPTH: usize = 5;
const MAX_PATH_LEN: usize = 300;
const MAX_CONTENT_BYTES: usize = 1024 * 1024;

/// What a new `AGENTS.md` says: a short entry point that sends the agent to the guide and
/// to the live instructions the CLI prints.
const STARTER: &str = include_str!("agent_starter.md");
/// The guide `AGENTS.md` points at: how to operate Nookly, without listing fields or flags.
const GUIDE: &str = include_str!("agent_guide.md");
/// The files every agent folder has. Created when missing, never overwritten, and never
/// deleted, since the entry file points at the guide.
const STANDARD_FILES: [(&str, &str); 2] = [(ENTRY_FILE, STARTER), ("NOOKLY.md", GUIDE)];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentFile {
    pub name: String,
    pub size: u64,
    /// RFC 3339, empty when the platform reports no modified time.
    pub modified: String,
}

fn invalid_name(name: &str) -> AppError {
    AppError::InvalidInput(format!(
        "\"{name}\" is not a valid file name. Use letters, numbers, spaces, dots, dashes or underscores and end with .md"
    ))
}

/// One path segment: no hidden names, no `..`, a short run of plain characters.
fn segment_ok(segment: &str) -> bool {
    segment
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric())
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ' ' | '-'))
        && segment.len() <= MAX_NAME_LEN
        && !segment.contains("..")
}

/// A name is a path of plain segments below the agent folder, ending in a `.md` file:
/// `PROFILE.md` or `Work/PROFILE.md`. No absolute paths, hidden names or `..`.
pub fn validate_name(name: &str) -> AppResult<()> {
    let segments: Vec<&str> = name.split('/').collect();
    let Some((file, folders)) = segments.split_last() else {
        return Err(invalid_name(name));
    };
    if name.len() > MAX_PATH_LEN
        || segments.len() > MAX_DEPTH
        || !file.ends_with(".md")
        || !segment_ok(file)
        || !folders.iter().all(|f| folder_segment_ok(f))
    {
        return Err(invalid_name(name));
    }
    Ok(())
}

/// A folder name may not look like a file, so a path never reads two ways.
fn folder_segment_ok(segment: &str) -> bool {
    segment_ok(segment) && !segment.to_lowercase().ends_with(".md")
}

/// A folder path: plain segments joined by `/`, at most `MAX_DEPTH - 1` deep.
pub fn validate_folder(path: &str) -> AppResult<()> {
    let segments: Vec<&str> = path.split('/').collect();
    if path.len() > MAX_PATH_LEN
        || segments.len() >= MAX_DEPTH
        || !segments.iter().all(|s| folder_segment_ok(s))
    {
        return Err(AppError::InvalidInput(format!(
            "\"{path}\" is not a valid folder name. Use letters, numbers, spaces, dots, dashes or underscores"
        )));
    }
    Ok(())
}

/// Creates the folder and each standard file that is missing. An existing file is never
/// opened for writing.
pub fn ensure_dir(dir: &Path) -> AppResult<()> {
    fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    for (name, content) in STANDARD_FILES {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join(name))
        {
            Ok(mut file) => file
                .write_all(content.as_bytes())
                .map_err(|e| AppError::Io(e.to_string()))?,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(AppError::Io(e.to_string())),
        }
    }
    Ok(())
}

/// Every valid entry below `dir`, as `(relative path, metadata)`. Links, hidden entries and
/// anything with an invalid name are skipped, so the trash and temp files never show.
fn walk(dir: &Path, prefix: &str, depth: usize, out: &mut Vec<(String, bool, fs::Metadata)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(meta) = entry.metadata() else { continue };
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if meta.is_dir() {
            if folder_segment_ok(&name) && depth + 1 < MAX_DEPTH {
                out.push((path.clone(), true, meta));
                walk(&entry.path(), &path, depth + 1, out);
            }
        } else if meta.is_file() && validate_name(&path).is_ok() {
            out.push((path, false, meta));
        }
    }
}

pub fn list(dir: &Path) -> AppResult<Vec<AgentFile>> {
    ensure_dir(dir)?;
    let mut entries = Vec::new();
    walk(dir, "", 0, &mut entries);
    let mut files: Vec<AgentFile> = entries
        .into_iter()
        .filter(|(_, is_dir, _)| !is_dir)
        .map(|(name, _, meta)| {
            let modified = meta
                .modified()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_default();
            AgentFile {
                name,
                size: meta.len(),
                modified,
            }
        })
        .collect();
    // The entry file leads, the rest read alphabetically.
    files.sort_by_key(|f| (f.name != ENTRY_FILE, f.name.to_lowercase()));
    Ok(files)
}

/// Every folder, empty ones included, as a path like `Work/Deep`, alphabetically.
pub fn list_folders(dir: &Path) -> AppResult<Vec<String>> {
    ensure_dir(dir)?;
    let mut entries = Vec::new();
    walk(dir, "", 0, &mut entries);
    let mut folders: Vec<String> = entries
        .into_iter()
        .filter(|(_, is_dir, _)| *is_dir)
        .map(|(path, _, _)| path)
        .collect();
    folders.sort_by_key(|f| f.to_lowercase());
    Ok(folders)
}

/// Creates the folder and any parent. One that exists is left as it is.
pub fn create_folder(dir: &Path, path: &str) -> AppResult<()> {
    validate_folder(path)?;
    ensure_dir(dir)?;
    fs::create_dir_all(dir.join(path)).map_err(|e| AppError::Io(e.to_string()))
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
    let target = dir.join(name);
    let parent = target.parent().unwrap_or(dir);
    fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
    let file_name = name.rsplit('/').next().unwrap_or(name);
    let temp = parent.join(format!(".{file_name}.tmp-{}", crate::db::new_id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, &target)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(AppError::Io(e.to_string()));
    }
    Ok(())
}

/// A free name in the trash for `label`, stamped so a second delete never replaces the first.
fn trash_target(dir: &Path, label: &str) -> AppResult<PathBuf> {
    let trash = dir.join(TRASH_DIR);
    fs::create_dir_all(&trash).map_err(|e| AppError::Io(e.to_string()))?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S%3f");
    let mut target = trash.join(format!("{stamp}-{label}"));
    let mut n = 1;
    // `rename` replaces an existing file, and the trash must never lose one.
    while target.exists() {
        target = trash.join(format!("{stamp}-{n}-{label}"));
        n += 1;
    }
    Ok(target)
}

/// Moves the file to `.trash/<timestamp>-<path>` so a delete can always be undone by
/// hand. The standard files at the top cannot be deleted.
pub fn delete(dir: &Path, name: &str) -> AppResult<()> {
    validate_name(name)?;
    if STANDARD_FILES
        .iter()
        .any(|(standard, _)| name.eq_ignore_ascii_case(standard))
    {
        return Err(AppError::InvalidInput(format!(
            "{name} is a standard file and cannot be deleted"
        )));
    }
    let source = dir.join(name);
    if !source.is_file() {
        return Err(AppError::NotFound(name.to_string()));
    }
    let target = trash_target(dir, &name.replace('/', "__"))?;
    fs::rename(&source, &target).map_err(|e| AppError::Io(e.to_string()))
}

/// Moves the folder with everything in it to `.trash/<timestamp>-<path>`.
pub fn delete_folder(dir: &Path, path: &str) -> AppResult<()> {
    validate_folder(path)?;
    let source = dir.join(path);
    if !source.is_dir() {
        return Err(AppError::NotFound(path.to_string()));
    }
    let target = trash_target(dir, &path.replace('/', "__"))?;
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
pub fn list_agent_folders(app: AppHandle) -> AppResult<Vec<String>> {
    list_folders(&agent_dir(&app)?)
}

#[tauri::command]
pub fn create_agent_folder(app: AppHandle, path: String) -> AppResult<()> {
    create_folder(&agent_dir(&app)?, &path)
}

#[tauri::command]
pub fn delete_agent_folder(app: AppHandle, path: String) -> AppResult<()> {
    delete_folder(&agent_dir(&app)?, &path)
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
            "a/../b.md",
            "/a.md",
            "a//b.md",
            "a/.hidden/b.md",
            "a/b",
            "a.md/b.md",
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
            "Work/PROFILE.md",
            "Work/Deep/style.md",
        ] {
            assert!(validate_name(good).is_ok(), "{good:?} should be accepted");
        }
    }

    #[test]
    fn listing_creates_the_folder_with_the_two_standard_files() {
        let dir = temp_dir();
        let files = list(&dir).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["AGENTS.md", "NOOKLY.md"]);
        // The entry file sends an agent to the guide and to the live instructions.
        let agents = read(&dir, "AGENTS.md").unwrap();
        assert!(agents.contains("NOOKLY.md"));
        assert!(agents.contains("nookly cli agent-instructions"));
        let guide = read(&dir, "NOOKLY.md").unwrap();
        assert!(guide.starts_with("# NOOKLY.md: How to Work With Nookly"));
        assert!(guide.contains("`nookly cli agent-instructions`"));
    }

    #[test]
    fn the_standard_files_only_name_commands_the_cli_has() {
        // `nookly describe` was never a command; the CLI is always `nookly cli ...`.
        for text in [STARTER, GUIDE] {
            assert!(!text.contains("`nookly describe`"));
            assert!(!text.contains("nookly describe"));
        }
    }

    #[test]
    fn an_existing_guide_is_never_overwritten_and_one_that_is_missing_comes_back_whole() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("NOOKLY.md"), "my own guide").unwrap();
        list(&dir).unwrap();
        assert_eq!(read(&dir, "NOOKLY.md").unwrap(), "my own guide");
        assert!(read(&dir, "AGENTS.md").unwrap().contains("nookly cli"));
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
        assert_eq!(names, ["AGENTS.md", "Alpha.md", "NOOKLY.md", "zeta.md"]);
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
        for protected in ["AGENTS.md", "agents.md", "NOOKLY.md", "nookly.md"] {
            assert!(delete(&dir, protected).is_err(), "{protected}");
        }
        assert!(dir.join("AGENTS.md").is_file());
        assert!(dir.join("NOOKLY.md").is_file());
        assert!(matches!(
            delete(&dir, "GONE.md"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn files_in_folders_round_trip_and_are_listed_with_their_path() {
        let dir = temp_dir();
        write(&dir, "Work/Deep/style.md", "short").unwrap();
        write(&dir, "Work/PROFILE.md", "me").unwrap();
        assert_eq!(read(&dir, "Work/Deep/style.md").unwrap(), "short");
        let names: Vec<String> = list(&dir).unwrap().into_iter().map(|f| f.name).collect();
        assert_eq!(
            names,
            [
                "AGENTS.md",
                "NOOKLY.md",
                "Work/Deep/style.md",
                "Work/PROFILE.md"
            ]
        );
        let leftovers = fs::read_dir(dir.join("Work"))
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn folders_can_be_created_and_listed_even_when_empty() {
        let dir = temp_dir();
        create_folder(&dir, "Empty").unwrap();
        create_folder(&dir, "Work/Deep").unwrap();
        // Creating one that exists is fine and changes nothing.
        write(&dir, "Work/a.md", "keep").unwrap();
        create_folder(&dir, "Work").unwrap();
        assert_eq!(read(&dir, "Work/a.md").unwrap(), "keep");
        assert_eq!(list_folders(&dir).unwrap(), ["Empty", "Work", "Work/Deep"]);
        for bad in ["", "../x", "a/../b", ".trash", "x.md", "a//b", "a/.b"] {
            assert!(create_folder(&dir, bad).is_err(), "{bad:?}");
        }
        // The trash is not a folder of the list.
        delete(&dir, "Work/a.md").unwrap();
        assert!(!list_folders(&dir)
            .unwrap()
            .iter()
            .any(|f| f.contains("trash")));
    }

    #[test]
    fn a_folder_cannot_be_nested_past_the_depth_limit() {
        let dir = temp_dir();
        assert!(create_folder(&dir, "a/b/c/d").is_ok());
        assert!(create_folder(&dir, "a/b/c/d/e").is_err());
        assert!(write(&dir, "a/b/c/d/e.md", "x").is_ok());
        assert!(write(&dir, "a/b/c/d/e/f.md", "x").is_err());
    }

    #[test]
    fn a_standard_file_name_inside_a_folder_is_an_ordinary_file() {
        let dir = temp_dir();
        write(&dir, "Work/AGENTS.md", "mine").unwrap();
        delete(&dir, "Work/AGENTS.md").unwrap();
        assert!(dir.join("AGENTS.md").is_file());
    }

    #[test]
    fn deleting_a_nested_file_keeps_it_in_the_trash() {
        let dir = temp_dir();
        write(&dir, "Work/STYLE.md", "short sentences").unwrap();
        delete(&dir, "Work/STYLE.md").unwrap();
        assert!(matches!(
            read(&dir, "Work/STYLE.md"),
            Err(AppError::NotFound(_))
        ));
        let trashed: Vec<PathBuf> = fs::read_dir(dir.join(TRASH_DIR))
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();
        assert_eq!(trashed.len(), 1);
        assert_eq!(fs::read_to_string(&trashed[0]).unwrap(), "short sentences");
        // The folder stays, now empty.
        assert_eq!(list_folders(&dir).unwrap(), ["Work"]);
    }

    #[test]
    fn deleting_a_folder_moves_it_whole_to_the_trash() {
        let dir = temp_dir();
        write(&dir, "Work/Deep/a.md", "one").unwrap();
        write(&dir, "Work/b.md", "two").unwrap();
        delete_folder(&dir, "Work").unwrap();
        assert!(list_folders(&dir).unwrap().is_empty());
        assert!(list(&dir)
            .unwrap()
            .iter()
            .all(|f| !f.name.starts_with("Work")));
        let trashed: Vec<PathBuf> = fs::read_dir(dir.join(TRASH_DIR))
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();
        assert_eq!(trashed.len(), 1);
        assert_eq!(
            fs::read_to_string(trashed[0].join("Deep/a.md")).unwrap(),
            "one"
        );
        assert_eq!(fs::read_to_string(trashed[0].join("b.md")).unwrap(), "two");
        assert!(matches!(
            delete_folder(&dir, "Work"),
            Err(AppError::NotFound(_))
        ));
        assert!(delete_folder(&dir, "../x").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_link_to_a_folder_is_ignored() {
        let dir = temp_dir();
        let outside = temp_dir();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.md"), "x").unwrap();
        ensure_dir(&dir).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("Link")).unwrap();
        assert!(list(&dir)
            .unwrap()
            .iter()
            .all(|f| !f.name.starts_with("Link")));
        assert!(list_folders(&dir).unwrap().is_empty());
    }
}
