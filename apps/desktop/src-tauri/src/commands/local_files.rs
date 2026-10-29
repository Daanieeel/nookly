//! Files that a media block names by their full path. Nookly only reads them: it checks they
//! are there, lets the webview show them, and hands them to the system to open.

use crate::db::local_path::{self, PathCheck, PathState};
use crate::error::{AppError, AppResult};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// What `check_local_path` tells the block.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFile {
    #[serde(flatten)]
    pub check: PathCheck,
    /// The file's name, for the card.
    pub name: String,
}

fn name_of(path: &str) -> String {
    path.trim()
        .rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(path)
        .to_string()
}

/// Checks the file and, when it can be read, lets the webview load exactly that file.
#[tauri::command]
pub fn check_local_path(app: AppHandle, path: String) -> LocalFile {
    let check = local_path::inspect(&path);
    if check.state == PathState::Ok {
        let _ = app.asset_protocol_scope().allow_file(path.trim());
    }
    LocalFile {
        check,
        name: name_of(&path),
    }
}

/// The file, if it is one Nookly may hand on: there, readable and not a program.
fn openable(path: &str) -> AppResult<String> {
    if local_path::is_program(path) {
        return Err(AppError::InvalidInput(
            "Nookly does not open programs from a path, only documents".into(),
        ));
    }
    let check = local_path::inspect(path);
    if check.state == PathState::Ok {
        Ok(path.trim().to_string())
    } else {
        Err(AppError::NotFound(check.message))
    }
}

/// Opens the file in its default app.
#[tauri::command]
pub fn open_local_path(app: AppHandle, path: String) -> AppResult<()> {
    app.opener()
        .open_path(openable(&path)?, None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Shows the file in the file manager.
#[tauri::command]
pub fn reveal_local_path(app: AppHandle, path: String) -> AppResult<()> {
    app.opener()
        .reveal_item_in_dir(openable(&path)?)
        .map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_name_is_the_last_part_of_the_path() {
        assert_eq!(name_of("/Users/me/Uni/Handout 3.pdf"), "Handout 3.pdf");
        assert_eq!(name_of("C:\\Uni\\a.pdf"), "a.pdf");
        assert_eq!(name_of("/Uni/dir/"), "dir");
    }

    #[test]
    fn a_program_or_a_missing_file_is_not_handed_on() {
        let program = openable("/Applications/Foo.app").unwrap_err().to_string();
        assert!(program.contains("programs"), "{program}");
        let missing = openable("/tmp/__nookly_gone__/a.pdf")
            .unwrap_err()
            .to_string();
        assert!(missing.contains("/tmp/__nookly_gone__/a.pdf"), "{missing}");
    }

    #[test]
    fn a_file_that_is_there_is_handed_on_as_written() {
        let dir = std::env::temp_dir().join(format!("nookly-open-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.pdf");
        std::fs::write(&file, b"%PDF").unwrap();
        let path = file.to_string_lossy().to_string();
        assert_eq!(openable(&format!("  {path}  ")).unwrap(), path);
    }
}
