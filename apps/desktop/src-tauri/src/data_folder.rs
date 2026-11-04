//! Gives the macOS data folder a name Finder opens.
//!
//! Tauri names the folder after the bundle identifier, `com.nookly.app`, and Finder treats
//! a folder ending in `.app` as an application, so double clicking it tries to launch it.
//! The real folder is renamed once to `Nookly` and a symlink with the old name is left in
//! its place. Nothing is copied and nothing stored changes: `nookly.db` keeps absolute paths
//! under the old name, and they keep resolving through the link, as do older releases, the
//! CLI and scripts.
//!
//! Every launch looks at the two names and does the smallest safe thing (see `relocate`).
//! It never merges two folders, never deletes data, and any failure leaves the data where it
//! was.

// Only macOS runs `tidy_at_startup`; elsewhere the rest is only built for its tests.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::io;
use std::path::Path;

/// The folder name Tauri derives from the bundle identifier.
pub const OLD_NAME: &str = "com.nookly.app";
/// The name Finder opens like any other folder.
pub const NEW_NAME: &str = "Nookly";

/// What `relocate` found and did.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// Renamed the folder and left the link behind.
    Moved,
    /// The folder was already renamed but the link was missing (a crash between the two
    /// steps): the link is back.
    LinkRestored,
    /// The old name is already a link to a folder that exists.
    AlreadyLinked,
    /// A link to `Nookly` pointed at nothing (the folder was deleted): the dead link is gone
    /// and the app starts fresh, as it would have.
    DanglingLinkRemoved,
    /// Both names are real folders. They are never merged.
    BothExist,
    /// Nothing to do: a new install, or a layout this does not know.
    Nothing,
}

#[cfg(unix)]
fn symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(not(unix))]
fn symlink(_target: &Path, _link: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "links to folders are only used on macOS",
    ))
}

/// What `path` is, without following a link. `None` when nothing is there.
fn kind(path: &Path) -> io::Result<Option<std::fs::FileType>> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) => Ok(Some(meta.file_type())),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Makes `base/Nookly` the real data folder and `base/com.nookly.app` a link to it. `base`
/// is `~/Library/Application Support`. Safe to run on every launch:
///
/// | `com.nookly.app` | `Nookly` | does |
/// | --- | --- | --- |
/// | real folder | absent | rename, then link |
/// | absent | folder | link |
/// | link | any | nothing |
/// | dead link to `Nookly` | absent | remove the link |
/// | real folder | present | nothing, never merges |
///
/// If the link cannot be made after the rename, the rename is undone before returning the
/// error, so the old layout is back exactly as it was.
pub fn relocate(base: &Path) -> io::Result<Outcome> {
    relocate_with(base, symlink)
}

/// `relocate` with the way a link is made handed in, so a failing link can be tested.
fn relocate_with(
    base: &Path,
    link: impl Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<Outcome> {
    let old = base.join(OLD_NAME);
    let new = base.join(NEW_NAME);
    let old_kind = kind(&old)?;
    let new_kind = kind(&new)?;

    match old_kind {
        Some(t) if t.is_symlink() => {
            // `exists` follows the link, so false means the target is gone.
            if old.exists() {
                return Ok(Outcome::AlreadyLinked);
            }
            // Only a link this module made (to `Nookly`) is ours to remove.
            if std::fs::read_link(&old)? == Path::new(NEW_NAME) && new_kind.is_none() {
                std::fs::remove_file(&old)?;
                return Ok(Outcome::DanglingLinkRemoved);
            }
            Ok(Outcome::Nothing)
        }
        Some(t) if t.is_dir() => match new_kind {
            Some(_) => Ok(Outcome::BothExist),
            None => {
                std::fs::rename(&old, &new)?;
                if let Err(e) = link(Path::new(NEW_NAME), &old) {
                    // Put everything back; the data never left the volume.
                    std::fs::rename(&new, &old)?;
                    return Err(e);
                }
                Ok(Outcome::Moved)
            }
        },
        None if new_kind.is_some_and(|t| t.is_dir()) => {
            link(Path::new(NEW_NAME), &old)?;
            Ok(Outcome::LinkRestored)
        }
        _ => Ok(Outcome::Nothing),
    }
}

/// Runs `relocate` for the real data folder at startup, before the database opens. Only an
/// installed macOS build: a debug build keeps its data in the repository, and other
/// platforms have no `.app` problem. A failure is logged and the app starts on the folder
/// it has.
pub fn tidy_at_startup() {
    #[cfg(target_os = "macos")]
    {
        if cfg!(debug_assertions) {
            return;
        }
        let Some(base) = dirs::data_dir() else { return };
        match relocate(&base) {
            Ok(Outcome::BothExist) => eprintln!(
                "Nookly: both {OLD_NAME} and {NEW_NAME} exist in {}; leaving them as they are",
                base.display()
            ),
            Ok(_) => {}
            Err(e) => eprintln!("Nookly: could not rename the data folder: {e}"),
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nookly-data-folder-{}", crate::db::new_id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn is_link_to_new(base: &Path) -> bool {
        fs::read_link(base.join(OLD_NAME)).is_ok_and(|t| t == Path::new(NEW_NAME))
    }

    #[test]
    fn a_real_old_folder_is_renamed_and_linked() {
        let base = scratch();
        fs::create_dir_all(base.join(OLD_NAME).join("files")).unwrap();
        fs::write(base.join(OLD_NAME).join("files/a.txt"), "mine").unwrap();

        assert_eq!(relocate(&base).unwrap(), Outcome::Moved);

        assert!(base.join(NEW_NAME).is_dir());
        assert!(!fs::symlink_metadata(base.join(NEW_NAME))
            .unwrap()
            .is_symlink());
        assert!(is_link_to_new(&base));
        // The old path still reaches every file, so stored absolute paths stay valid.
        assert_eq!(
            fs::read_to_string(base.join(OLD_NAME).join("files/a.txt")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn a_database_opens_through_the_old_name_and_its_stored_paths_resolve() {
        let base = scratch();
        let old = base.join(OLD_NAME);
        fs::create_dir_all(old.join("files")).unwrap();
        let stored = old.join("files/doc.txt");
        fs::write(&stored, "attachment").unwrap();
        {
            let conn = crate::db::connect(&old).unwrap();
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS probe (path TEXT); INSERT INTO probe VALUES ('x');",
            )
            .unwrap();
            conn.execute(
                "UPDATE probe SET path = ?1",
                [stored.to_string_lossy().as_ref()],
            )
            .unwrap();
        }

        assert_eq!(relocate(&base).unwrap(), Outcome::Moved);

        let conn = crate::db::connect(&old).unwrap();
        let path: String = conn
            .query_row("SELECT path FROM probe", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "attachment");
        // The real file lives under the new name.
        assert!(base.join(NEW_NAME).join("nookly.db").is_file());
    }

    #[test]
    fn it_is_idempotent() {
        let base = scratch();
        fs::create_dir_all(base.join(OLD_NAME)).unwrap();
        assert_eq!(relocate(&base).unwrap(), Outcome::Moved);
        assert_eq!(relocate(&base).unwrap(), Outcome::AlreadyLinked);
        assert_eq!(relocate(&base).unwrap(), Outcome::AlreadyLinked);
        assert!(is_link_to_new(&base));
    }

    #[test]
    fn a_missing_link_is_restored_after_a_crash_between_the_steps() {
        let base = scratch();
        fs::create_dir_all(base.join(NEW_NAME)).unwrap();
        fs::write(base.join(NEW_NAME).join("nookly.db"), "db").unwrap();

        assert_eq!(relocate(&base).unwrap(), Outcome::LinkRestored);

        assert!(is_link_to_new(&base));
        assert_eq!(
            fs::read_to_string(base.join(OLD_NAME).join("nookly.db")).unwrap(),
            "db"
        );
    }

    #[test]
    fn two_real_folders_are_never_merged() {
        let base = scratch();
        fs::create_dir_all(base.join(OLD_NAME)).unwrap();
        fs::create_dir_all(base.join(NEW_NAME)).unwrap();
        fs::write(base.join(OLD_NAME).join("old.txt"), "old").unwrap();
        fs::write(base.join(NEW_NAME).join("new.txt"), "new").unwrap();

        assert_eq!(relocate(&base).unwrap(), Outcome::BothExist);

        assert!(!fs::symlink_metadata(base.join(OLD_NAME))
            .unwrap()
            .is_symlink());
        assert!(base.join(OLD_NAME).join("old.txt").is_file());
        assert!(base.join(NEW_NAME).join("new.txt").is_file());
        assert!(!base.join(NEW_NAME).join("old.txt").exists());
    }

    #[test]
    fn a_dead_link_to_the_new_name_is_removed() {
        let base = scratch();
        symlink(Path::new(NEW_NAME), &base.join(OLD_NAME)).unwrap();

        assert_eq!(relocate(&base).unwrap(), Outcome::DanglingLinkRemoved);

        assert!(fs::symlink_metadata(base.join(OLD_NAME)).is_err());
        // The next launch is a fresh install again, then migrates like any other.
        fs::create_dir_all(base.join(OLD_NAME)).unwrap();
        assert_eq!(relocate(&base).unwrap(), Outcome::Moved);
    }

    #[test]
    fn a_dead_link_somewhere_else_is_left_alone() {
        let base = scratch();
        symlink(Path::new("/nonexistent/elsewhere"), &base.join(OLD_NAME)).unwrap();

        assert_eq!(relocate(&base).unwrap(), Outcome::Nothing);

        assert_eq!(
            fs::read_link(base.join(OLD_NAME)).unwrap(),
            Path::new("/nonexistent/elsewhere")
        );
    }

    #[test]
    fn a_link_to_a_live_folder_is_left_alone() {
        let base = scratch();
        let elsewhere = scratch();
        symlink(&elsewhere, &base.join(OLD_NAME)).unwrap();

        assert_eq!(relocate(&base).unwrap(), Outcome::AlreadyLinked);

        assert_eq!(fs::read_link(base.join(OLD_NAME)).unwrap(), elsewhere);
        assert!(!base.join(NEW_NAME).exists());
    }

    #[test]
    fn a_new_install_has_nothing_to_move() {
        let base = scratch();
        assert_eq!(relocate(&base).unwrap(), Outcome::Nothing);
        assert!(!base.join(NEW_NAME).exists());
        assert!(fs::symlink_metadata(base.join(OLD_NAME)).is_err());
    }

    #[test]
    fn a_plain_file_with_the_old_name_is_left_alone() {
        let base = scratch();
        fs::write(base.join(OLD_NAME), "not a folder").unwrap();
        assert_eq!(relocate(&base).unwrap(), Outcome::Nothing);
        assert_eq!(
            fs::read_to_string(base.join(OLD_NAME)).unwrap(),
            "not a folder"
        );
    }

    #[test]
    fn a_failed_link_puts_the_folder_back_exactly_as_it_was() {
        let base = scratch();
        fs::create_dir_all(base.join(OLD_NAME).join("files")).unwrap();
        fs::write(base.join(OLD_NAME).join("files/keep.txt"), "x").unwrap();

        let failing = |_: &Path, _: &Path| Err(io::Error::other("no links here"));
        assert!(relocate_with(&base, failing).is_err());

        let old = base.join(OLD_NAME);
        assert!(!fs::symlink_metadata(&old).unwrap().is_symlink());
        assert!(old.join("files/keep.txt").is_file());
        assert!(!base.join(NEW_NAME).exists());
        // And the next launch, with links working again, moves it as usual.
        assert_eq!(relocate(&base).unwrap(), Outcome::Moved);
    }
}
