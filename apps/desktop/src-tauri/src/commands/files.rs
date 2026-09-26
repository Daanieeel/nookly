use crate::db::files::{self, FileEntity};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn import_file(
    app: AppHandle,
    state: State<DbState>,
    space_id: String,
    source_path: String,
) -> AppResult<FileEntity> {
    let files_dir: PathBuf = crate::db::resolve_app_data_dir(
        app.path()
            .app_data_dir()
            .map_err(|e| AppError::Db(e.to_string()))?,
    )
    .join("files");
    let conn = state.0.lock().unwrap();
    files::import_file(
        &conn,
        &files_dir,
        space_id,
        std::path::Path::new(&source_path),
    )
}

/// What a pasted link turned into.
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LinkImport {
    File {
        file: Box<FileEntity>,
    },
    /// Not a file: the UI offers to save it as a Bookmark instead.
    Webpage,
}

fn files_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(crate::db::resolve_app_data_dir(
        app.path()
            .app_data_dir()
            .map_err(|e| AppError::Db(e.to_string()))?,
    )
    .join("files"))
}

async fn download(url: String) -> AppResult<files::Download> {
    tauri::async_runtime::spawn_blocking(move || files::download(&url))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

/// Downloads a link into storage as a real File.
#[tauri::command]
pub async fn import_file_from_url(
    app: AppHandle,
    state: State<'_, DbState>,
    space_id: String,
    url: String,
) -> AppResult<LinkImport> {
    match download(url.clone()).await? {
        files::Download::Webpage => Ok(LinkImport::Webpage),
        files::Download::File { filename, bytes } => {
            let dir = files_dir(&app)?;
            let conn = state.0.lock().unwrap();
            let file = files::store_file(&conn, &dir, space_id, &filename, &bytes, Some(&url))?;
            Ok(LinkImport::File {
                file: Box::new(file),
            })
        }
    }
}

/// Downloads the file behind a link-only File, from before links were stored.
#[tauri::command]
pub async fn download_linked_file(
    app: AppHandle,
    state: State<'_, DbState>,
    entity_id: String,
) -> AppResult<LinkImport> {
    let url = {
        let conn = state.0.lock().unwrap();
        files::get_file(&conn, &entity_id)?
            .url
            .ok_or_else(|| AppError::InvalidInput("this file has no link to download".into()))?
    };
    match download(url).await? {
        files::Download::Webpage => Ok(LinkImport::Webpage),
        files::Download::File { filename, bytes } => {
            let dir = files_dir(&app)?;
            let conn = state.0.lock().unwrap();
            let file = files::attach_download(&conn, &dir, &entity_id, &filename, &bytes)?;
            Ok(LinkImport::File {
                file: Box::new(file),
            })
        }
    }
}

/// A referenced file lives outside the asset protocol's static scope, so each
/// one is let in by exact path as it's handed to the webview.
fn allow_reference(app: &AppHandle, file: &FileEntity) {
    if file.local_path.is_none() {
        if let Some(path) = &file.source_path {
            let _ = app.asset_protocol_scope().allow_file(path);
        }
    }
}

#[tauri::command]
pub fn list_files(
    app: AppHandle,
    state: State<DbState>,
    space_id: String,
) -> AppResult<Vec<FileEntity>> {
    let conn = state.0.lock().unwrap();
    let files = files::list_files(&conn, &space_id)?;
    files.iter().for_each(|f| allow_reference(&app, f));
    Ok(files)
}

/// Backfills search content for every File in `space_id` missing an index —
/// the Files page's "Reindex" button (§ Reindex feature).
#[tauri::command]
pub fn reindex_missing_files(
    state: State<DbState>,
    space_id: String,
) -> AppResult<files::ReindexSummary> {
    let conn = state.0.lock().unwrap();
    files::reindex_missing(&conn, Some(&space_id))
}

#[tauri::command]
pub fn get_file(app: AppHandle, state: State<DbState>, entity_id: String) -> AppResult<FileEntity> {
    let conn = state.0.lock().unwrap();
    let file = files::get_file(&conn, &entity_id)?;
    allow_reference(&app, &file);
    Ok(file)
}

/// Adds a file from disk by reference, leaving it where it is.
#[tauri::command]
pub fn reference_file(
    app: AppHandle,
    state: State<DbState>,
    space_id: String,
    path: String,
) -> AppResult<FileEntity> {
    let conn = state.0.lock().unwrap();
    let file = files::reference_file(&conn, space_id, std::path::Path::new(&path))?;
    allow_reference(&app, &file);
    Ok(file)
}

/// Copies a referenced file into Nookly's storage.
#[tauri::command]
pub fn copy_file_into_storage(
    app: AppHandle,
    state: State<DbState>,
    entity_id: String,
) -> AppResult<FileEntity> {
    let dir = files_dir(&app)?;
    let conn = state.0.lock().unwrap();
    files::copy_into_storage(&conn, &dir, &entity_id)
}

/// Where a File's bytes are: the stored copy, else the referenced original.
fn file_on_disk(state: &State<DbState>, entity_id: &str) -> AppResult<String> {
    let conn = state.0.lock().unwrap();
    let file = files::get_file(&conn, entity_id)?;
    file.local_path
        .or(file.source_path)
        .ok_or_else(|| AppError::InvalidInput("this file is only a link".into()))
}

/// Opens a File in its default app. Done here rather than through the opener's
/// JS API, whose path scope covers only Nookly's storage, not referenced files.
#[tauri::command]
pub fn open_file(app: AppHandle, state: State<DbState>, entity_id: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = file_on_disk(&state, &entity_id)?;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Shows a File in Finder (or the platform's file manager).
#[tauri::command]
pub fn reveal_file(app: AppHandle, state: State<DbState>, entity_id: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = file_on_disk(&state, &entity_id)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Copies an imported file out of Nookly's storage to `destination`, e.g. a path
/// picked in a native save dialog. Link-only files have nothing local to copy.
#[tauri::command]
pub fn export_file(state: State<DbState>, entity_id: String, destination: String) -> AppResult<()> {
    let file = {
        let conn = state.0.lock().unwrap();
        files::get_file(&conn, &entity_id)?
    };
    let source = file.local_path.or(file.source_path).ok_or_else(|| {
        AppError::InvalidInput("this file is a link, there is no local copy to export".into())
    })?;
    std::fs::copy(&source, &destination)
        .map(|_| ())
        .map_err(|err| AppError::Io(err.to_string()))
}

/// Corrects a File's Added date; it otherwise defaults to the day it was
/// imported or downloaded.
#[tauri::command]
pub fn set_file_added_at(
    state: State<DbState>,
    entity_id: String,
    added_at: String,
) -> AppResult<FileEntity> {
    let conn = state.0.lock().unwrap();
    files::set_added_at(&conn, &entity_id, &added_at)
}

/// Replaces a File's stored copy with a newer version from disk.
#[tauri::command]
pub fn replace_file(
    app: AppHandle,
    state: State<DbState>,
    entity_id: String,
    source_path: String,
) -> AppResult<FileEntity> {
    let dir = files_dir(&app)?;
    let conn = state.0.lock().unwrap();
    let (file, previous) =
        files::replace_file(&conn, &dir, &entity_id, std::path::Path::new(&source_path))?;
    // Committed: the replaced copy has no entity left pointing at it.
    if let Some(previous) = previous.filter(|p| Some(p) != file.local_path.as_ref()) {
        let _ = std::fs::remove_file(previous);
    }
    Ok(file)
}

/// An app that can open a File, for the "Open in" menu.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWithApp {
    pub name: String,
    pub path: String,
    pub is_default: bool,
    /// The app's icon as a PNG data URL, when the platform provides one.
    pub icon: Option<String>,
}

/// The apps the system says can open this file, its default app first. Empty
/// where the platform can't be asked yet; the menu then offers only "Other App".
#[tauri::command]
pub fn list_open_with_apps(
    state: State<DbState>,
    entity_id: String,
) -> AppResult<Vec<OpenWithApp>> {
    let path = file_on_disk(&state, &entity_id)?;
    Ok(apps_for(&path))
}

#[cfg(target_os = "macos")]
fn apps_for(path: &str) -> Vec<OpenWithApp> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSString, NSURL};

    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let workspace = NSWorkspace::sharedWorkspace();
    let app_path = |app: &NSURL| app.path().map(|p| p.to_string());
    let default = workspace
        .URLForApplicationToOpenURL(&url)
        .and_then(|app| app_path(&app));
    let mut apps: Vec<OpenWithApp> = workspace
        .URLsForApplicationsToOpenURL(&url)
        .iter()
        .filter_map(|app| app_path(&app))
        .map(|path| OpenWithApp {
            name: std::path::Path::new(&path)
                .file_stem()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone()),
            is_default: Some(&path) == default.as_ref(),
            icon: app_icon(&workspace, &path),
            path,
        })
        .collect();
    // Default first, then by name. The same app can be installed twice (e.g. in
    // ~/Applications); keep one, the default if either is.
    apps.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| b.is_default.cmp(&a.is_default))
    });
    apps.dedup_by(|a, b| a.name == b.name);
    apps.sort_by_key(|app| !app.is_default);
    apps
}

/// Icons are drawn once per app and kept for the session.
#[cfg(target_os = "macos")]
static ICONS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, Option<String>>>,
> = std::sync::LazyLock::new(Default::default);

/// The app's icon at the menu's 16 pt, drawn at 2x for Retina, as a PNG data URL.
#[cfg(target_os = "macos")]
fn app_icon(workspace: &objc2_app_kit::NSWorkspace, app_path: &str) -> Option<String> {
    use base64::Engine;
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

    if let Some(cached) = ICONS.lock().unwrap().get(app_path) {
        return cached.clone();
    }
    let icon = workspace.iconForFile(&NSString::from_str(app_path));
    let mut rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(32.0, 32.0));
    // SAFETY: `rect` is a valid, exclusively borrowed rect for the call.
    let png = unsafe { icon.CGImageForProposedRect_context_hints(&mut rect, None, None) }
        .and_then(|cg| {
            let rep = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg);
            // SAFETY: an empty property dictionary asks for the defaults.
            unsafe {
                rep.representationUsingType_properties(
                    NSBitmapImageFileType::PNG,
                    &NSDictionary::new(),
                )
            }
        })
        .map(|data| {
            format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(data.to_vec())
            )
        });
    ICONS
        .lock()
        .unwrap()
        .insert(app_path.to_string(), png.clone());
    png
}

#[cfg(not(target_os = "macos"))]
fn apps_for(_path: &str) -> Vec<OpenWithApp> {
    Vec::new()
}

/// Opens a File with a specific app, by name or path (`/Applications/Preview.app`).
#[tauri::command]
pub fn open_file_with(
    app: AppHandle,
    state: State<DbState>,
    entity_id: String,
    app_path: String,
) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = file_on_disk(&state, &entity_id)?;
    app.opener()
        .open_path(path, Some(app_path))
        .map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn lists_apps_for_a_text_file_default_first() {
        let path =
            std::env::temp_dir().join(format!("nookly-open-with-{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&path, "hi").unwrap();
        let apps = super::apps_for(path.to_str().unwrap());
        assert!(
            apps.iter().any(|a| a.name == "TextEdit"),
            "{:?}",
            apps.iter().map(|a| &a.name).collect::<Vec<_>>()
        );
        assert!(apps[0].is_default);
        assert_eq!(apps.iter().filter(|a| a.is_default).count(), 1);
        let icon = apps[0]
            .icon
            .as_deref()
            .expect("the default app has an icon");
        assert!(icon.starts_with("data:image/png;base64,"));
        // Menu sized, not the 1024 px source: a 32 px PNG stays well under 20 KB.
        assert!(icon.len() < 20_000, "{} bytes", icon.len());
    }
}
