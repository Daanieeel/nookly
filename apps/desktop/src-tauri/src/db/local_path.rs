//! Full paths of files on this computer, as a media block can hold them. Nookly only ever
//! reads these files, and the path stays in the block exactly as written when the file cannot
//! be reached: it works again once the file or the drive is back.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

/// A path as a `file://` link, the same on every platform: a Unix path on Windows and a Windows
/// path on a Mac still become links (`url::Url::from_file_path` only takes the paths of the
/// machine it runs on). Spaces and other characters a link cannot hold are encoded.
pub fn file_url(path: &str) -> Option<String> {
    let slashed = path.trim().replace('\\', "/");
    if slashed.starts_with("//") {
        // A network share: `//server/share/a.pdf` has a host.
        return url::Url::parse(&format!("file:{slashed}"))
            .ok()
            .map(String::from);
    }
    let mut link = url::Url::parse("file:///").ok()?;
    link.set_path(&if slashed.starts_with('/') {
        slashed
    } else {
        format!("/{slashed}")
    });
    Some(link.into())
}

/// Whether `text` is the full path of a file: `/Users/me/a.pdf`, `C:\Users\me\a.pdf`,
/// `C:/Users/me/a.pdf` or `\\server\share\a.pdf`. A relative path, `~/a.pdf` and a link are not.
pub fn is_local_path(text: &str) -> bool {
    let text = text.trim();
    let drive = text.len() >= 3
        && text.as_bytes()[0].is_ascii_alphabetic()
        && text.as_bytes()[1] == b':'
        && matches!(text.as_bytes()[2], b'\\' | b'/');
    (text.starts_with('/') && !text.starts_with("//")) || text.starts_with("\\\\") || drive
}

/// Why a path is or is not usable right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PathState {
    /// A file Nookly can read.
    Ok,
    /// Nothing is there: the file was moved, renamed or deleted.
    Missing,
    /// The drive or network volume the path is on is not connected.
    Unavailable,
    /// The file is there, but Nookly may not read it.
    Unreadable,
    /// The path names a folder.
    Folder,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathCheck {
    pub state: PathState,
    /// What happened, in plain words, naming the path. Empty when the file is fine.
    pub message: String,
}

fn check(state: PathState, path: &str) -> PathCheck {
    let message = match state {
        PathState::Ok => String::new(),
        PathState::Missing => {
            format!("{path} was not found. It may have been moved, renamed or deleted.")
        }
        PathState::Unavailable => format!(
            "{path} can't be reached right now because its drive or network volume is not available."
        ),
        PathState::Unreadable => format!("Nookly is not allowed to read {path}."),
        PathState::Folder => format!("{path} is a folder, not a file."),
    };
    PathCheck { state, message }
}

/// The folder a path lives on when that folder is a mount point of its own (an external
/// drive, a network share, a Windows drive), or `None` for a path on the main disk.
fn volume_root(path: &Path) -> Option<PathBuf> {
    let mut parts = path.components();
    let first = parts.next()?;
    if let Component::Prefix(prefix) = first {
        // A Windows drive or share: the prefix itself is the volume.
        return Some(PathBuf::from(prefix.as_os_str()).join(std::path::MAIN_SEPARATOR_STR));
    }
    let names: Vec<_> = parts.filter_map(|c| c.as_os_str().to_str()).collect();
    let under = |root: &[&str], depth: usize| -> Option<PathBuf> {
        let wanted = root.len() + depth;
        let matches = names.len() > wanted - 1 && names.iter().zip(root).all(|(a, b)| a == b);
        matches.then(|| {
            let mut volume = PathBuf::from("/");
            volume.extend(&names[..wanted]);
            volume
        })
    };
    under(&["Volumes"], 1)
        .or_else(|| under(&["mnt"], 1))
        .or_else(|| under(&["media"], 2))
        .or_else(|| under(&["run", "media"], 2))
}

/// What can be said about `path` right now. Only reads: it never creates, changes or
/// removes anything.
pub fn inspect(path: &str) -> PathCheck {
    let text = path.trim();
    let on_disk = Path::new(text);
    match std::fs::metadata(on_disk) {
        Ok(meta) if meta.is_dir() => check(PathState::Folder, text),
        Ok(_) => match std::fs::File::open(on_disk) {
            Ok(_) => check(PathState::Ok, text),
            Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
                check(PathState::Unreadable, text)
            }
            Err(_) => check(PathState::Missing, text),
        },
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            check(PathState::Unreadable, text)
        }
        Err(_) => {
            // A drive that is not connected makes everything on it "not found", which is
            // worth telling apart from a file that is gone.
            let off = volume_root(on_disk).is_some_and(|volume| !volume.exists())
                || !cfg!(windows) && text.starts_with("\\\\")
                || !cfg!(windows) && text.as_bytes().get(1) == Some(&b':');
            check(
                if off {
                    PathState::Unavailable
                } else {
                    PathState::Missing
                },
                text,
            )
        }
    }
}

/// File types Nookly will not start from a path: they are programs, not documents.
const PROGRAM_EXTENSIONS: &[&str] = &[
    "app", "command", "sh", "bash", "zsh", "bat", "cmd", "com", "exe", "msi", "scr", "ps1", "vbs",
    "jar", "pkg", "dmg", "desktop", "appimage", "workflow",
];

/// Whether opening the file would start a program.
pub fn is_program(path: &str) -> bool {
    Path::new(path.trim())
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| PROGRAM_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// A media block's content, as one of the three things it can hold.
#[derive(Debug, PartialEq, Eq)]
pub enum MediaTarget<'a> {
    Empty,
    Mention,
    Url(&'a str),
    Path(&'a str),
    /// Something else: not a mention, a link or a full path.
    Invalid,
}

pub fn media_target(content: &str) -> MediaTarget<'_> {
    let content = content.trim();
    if content.is_empty() {
        MediaTarget::Empty
    } else if content.starts_with("http://") || content.starts_with("https://") {
        MediaTarget::Url(content)
    } else if is_local_path(content) {
        MediaTarget::Path(content)
    } else if content.starts_with('[') && content.contains("](mention:") {
        MediaTarget::Mention
    } else {
        MediaTarget::Invalid
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nookly-local-path-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn full_paths_are_told_from_everything_else() {
        for path in [
            "/Users/daniel/Downloads/Handout_Woche3.pdf",
            "/a",
            "C:\\Users\\me\\a.pdf",
            "c:/Users/me/a.pdf",
            "\\\\server\\share\\a.pdf",
            "  /Users/me/a.pdf  ",
        ] {
            assert!(is_local_path(path), "{path}");
        }
        for text in [
            "",
            "a.pdf",
            "./a.pdf",
            "../a.pdf",
            "~/a.pdf",
            "https://example.com/a.pdf",
            "file:///Users/me/a.pdf",
            "//example.com/a.pdf",
            "C:a.pdf",
            "[a](mention:abc)",
        ] {
            assert!(!is_local_path(text), "{text}");
        }
    }

    #[test]
    fn a_path_becomes_a_file_link_on_every_platform() {
        assert_eq!(
            file_url("/Users/me/Uni/Handout 3.pdf").as_deref(),
            Some("file:///Users/me/Uni/Handout%203.pdf")
        );
        assert_eq!(
            file_url("C:\\Uni\\a.pdf").as_deref(),
            Some("file:///C:/Uni/a.pdf")
        );
        assert_eq!(
            file_url("c:/Uni/a b.pdf").as_deref(),
            Some("file:///c:/Uni/a%20b.pdf")
        );
        assert_eq!(
            file_url("\\\\server\\share\\a.pdf").as_deref(),
            Some("file://server/share/a.pdf")
        );
    }

    #[test]
    fn a_media_target_is_a_mention_a_link_or_a_path() {
        assert_eq!(media_target("  "), MediaTarget::Empty);
        assert_eq!(media_target("[a.pdf](mention:abc-1)"), MediaTarget::Mention);
        assert_eq!(
            media_target("https://x.dev/a.pdf"),
            MediaTarget::Url("https://x.dev/a.pdf")
        );
        assert_eq!(media_target("/tmp/a.pdf"), MediaTarget::Path("/tmp/a.pdf"));
        assert_eq!(media_target("a.pdf"), MediaTarget::Invalid);
        assert_eq!(media_target("ftp://x/a"), MediaTarget::Invalid);
    }

    #[test]
    fn a_file_that_can_be_read_is_ok() {
        let dir = temp_dir();
        let file = dir.join("a.pdf");
        std::fs::write(&file, b"%PDF").unwrap();
        let found = inspect(file.to_str().unwrap());
        assert_eq!(found.state, PathState::Ok);
        assert_eq!(found.message, "");
    }

    #[test]
    fn a_file_that_is_gone_is_missing_and_the_message_names_the_path() {
        let dir = temp_dir();
        let file = dir.join("gone.pdf");
        let path = file.to_str().unwrap();
        let found = inspect(path);
        assert_eq!(found.state, PathState::Missing);
        assert!(found.message.contains(path), "{}", found.message);
        assert!(found.message.contains("moved, renamed or deleted"));
    }

    #[test]
    fn a_folder_is_not_a_file() {
        let dir = temp_dir();
        let found = inspect(dir.to_str().unwrap());
        assert_eq!(found.state, PathState::Folder);
        assert!(found.message.contains("is a folder"));
    }

    #[cfg(unix)]
    #[test]
    fn a_file_nookly_may_not_read_is_unreadable() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir();
        let file = dir.join("secret.pdf");
        std::fs::write(&file, b"x").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o000)).unwrap();
        // A user who may read anything (root) cannot show this case.
        if std::fs::File::open(&file).is_ok() {
            return;
        }
        let found = inspect(file.to_str().unwrap());
        assert_eq!(found.state, PathState::Unreadable);
        assert!(found.message.contains("not allowed to read"));
    }

    #[cfg(unix)]
    #[test]
    fn a_drive_that_is_not_connected_is_unavailable_not_missing() {
        for path in [
            "/Volumes/__nookly_no_such_drive__/Uni/a.pdf",
            "/mnt/__nookly_no_such_drive__/a.pdf",
            "/media/someone/__nookly_no_such_drive__/a.pdf",
        ] {
            let found = inspect(path);
            assert_eq!(found.state, PathState::Unavailable, "{path}");
            assert!(found.message.contains("drive or network volume"));
            assert!(found.message.contains(path));
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_windows_path_on_this_computer_is_unavailable() {
        assert_eq!(inspect("D:\\Uni\\a.pdf").state, PathState::Unavailable);
        assert_eq!(
            inspect("\\\\server\\share\\a.pdf").state,
            PathState::Unavailable
        );
    }

    #[test]
    fn the_volume_of_a_path_is_found_by_where_drives_are_mounted() {
        assert_eq!(
            volume_root(Path::new("/Volumes/Stick/Uni/a.pdf")),
            Some(PathBuf::from("/Volumes/Stick"))
        );
        assert_eq!(
            volume_root(Path::new("/media/me/Stick/a.pdf")),
            Some(PathBuf::from("/media/me/Stick"))
        );
        assert_eq!(
            volume_root(Path::new("/run/media/me/Stick/a.pdf")),
            Some(PathBuf::from("/run/media/me/Stick"))
        );
        assert_eq!(volume_root(Path::new("/Users/me/a.pdf")), None);
        assert_eq!(volume_root(Path::new("/Volumes")), None);
    }

    #[test]
    fn inspecting_changes_nothing() {
        let dir = temp_dir();
        let before: Vec<_> = std::fs::read_dir(&dir).unwrap().collect();
        inspect(dir.join("new.pdf").to_str().unwrap());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), before.len());
    }

    #[test]
    fn programs_are_not_opened() {
        for path in [
            "/Applications/Foo.app",
            "/tmp/run.SH",
            "C:\\x\\setup.exe",
            "/a/b.command",
        ] {
            assert!(is_program(path), "{path}");
        }
        for path in [
            "/tmp/a.pdf",
            "/tmp/notes.txt",
            "/tmp/archive.zip",
            "/tmp/noext",
        ] {
            assert!(!is_program(path), "{path}");
        }
    }
}
