//! Local page snapshots for bookmark previews. The page loads in a borderless
//! window parked far off screen, so nothing flashes up; the window matches no
//! capability, so the remote page gets no access to the app's commands.

use crate::db::bookmarks::{self, Bookmark};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

/// The viewport pages are rendered at: laptop wide, in the cards' 1.91:1 shape.
const VIEWPORT: (f64, f64) = (1280.0, 670.0);
/// Snapshot width in points; twice that in pixels on a Retina screen, sharp
/// enough for the details sheet.
const SNAPSHOT_WIDTH: f64 = 640.0;
/// Most pages finish loading well within this; slower ones fall back to `og:image`.
const LOAD_TIMEOUT: Duration = Duration::from_secs(20);
/// Web fonts, images and entrance animations settle after the load event.
const SETTLE: Duration = Duration::from_millis(1500);
const SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(10);

/// One capture at a time: each one is a whole browser page.
static CAPTURE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
pub async fn capture_bookmark_screenshot(
    app: AppHandle,
    state: State<'_, DbState>,
    entity_id: String,
) -> AppResult<Bookmark> {
    let url = {
        let conn = state.0.lock().unwrap();
        bookmarks::get_bookmark(&conn, &entity_id)?.url
    };
    let dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("bookmark-previews");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Io(e.to_string()))?;

    let jpeg = {
        let _guard = CAPTURE_LOCK.lock().await;
        capture(&app, &url).await?
    };
    // A new name per capture, so the webview never shows a cached older one.
    let path = dir.join(format!(
        "{entity_id}-{}.jpg",
        chrono::Utc::now().timestamp_millis()
    ));
    std::fs::write(&path, jpeg).map_err(|e| AppError::Io(e.to_string()))?;

    let conn = state.0.lock().unwrap();
    bookmarks::set_screenshot(&conn, &entity_id, &path.to_string_lossy())
}

async fn capture(app: &AppHandle, url: &str) -> AppResult<Vec<u8>> {
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if cfg!(not(target_os = "macos")) {
        return snapshot_unsupported();
    }
    let parsed = url
        .parse()
        .map_err(|e| AppError::InvalidInput(format!("not a URL: {e}")))?;
    let (loaded_tx, loaded_rx) = tokio::sync::oneshot::channel::<()>();
    let loaded_tx = std::sync::Mutex::new(Some(loaded_tx));
    let label = format!("bookmark-snapshot-{}", uuid::Uuid::new_v4());

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .inner_size(VIEWPORT.0, VIEWPORT.1)
        .position(-20_000.0, -20_000.0)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(true)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Some(tx) = loaded_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|e| AppError::Io(format!("couldn't open the page: {e}")))?;

    let result = async {
        tokio::time::timeout(LOAD_TIMEOUT, loaded_rx)
            .await
            .map_err(|_| AppError::Io("the page took too long to load".into()))?
            .map_err(|_| AppError::Io("the page closed while loading".into()))?;
        tokio::time::sleep(SETTLE).await;
        snapshot(&window).await
    }
    .await;
    let _ = window.destroy();
    result
}

#[cfg(target_os = "macos")]
async fn snapshot(window: &tauri::WebviewWindow) -> AppResult<Vec<u8>> {
    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError, NSNumber};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<Vec<u8>>>();
    let tx = std::sync::Mutex::new(Some(tx));
    window
        .with_webview(move |webview| {
            // `with_webview` runs its closure on the main thread.
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            // SAFETY: on macOS `inner()` is the page's `WKWebView`, alive for the
            // whole closure since the window is only destroyed after this returns.
            let view: &WKWebView = unsafe { &*webview.inner().cast::<WKWebView>() };
            let config = unsafe { WKSnapshotConfiguration::new(mtm) };
            unsafe { config.setSnapshotWidth(Some(&NSNumber::new_f64(SNAPSHOT_WIDTH))) };
            let done = RcBlock::new(move |image: *mut NSImage, _error: *mut NSError| {
                // SAFETY: WebKit hands over a valid image or null.
                let jpeg = unsafe { image.as_ref() }.and_then(|image| {
                    let tiff = image.TIFFRepresentation()?;
                    let rep = NSBitmapImageRep::imageRepWithData(&tiff)?;
                    // SAFETY: an empty property dictionary asks for the defaults.
                    let data = unsafe {
                        rep.representationUsingType_properties(
                            NSBitmapImageFileType::JPEG,
                            &NSDictionary::new(),
                        )
                    }?;
                    Some(data.to_vec())
                });
                if let Some(tx) = tx.lock().unwrap().take() {
                    let _ = tx.send(jpeg);
                }
            });
            // SAFETY: `config` and `done` are retained by WebKit until it calls back.
            unsafe { view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &done) };
        })
        .map_err(|e| AppError::Io(format!("couldn't reach the page: {e}")))?;

    tokio::time::timeout(SNAPSHOT_TIMEOUT, rx)
        .await
        .map_err(|_| AppError::Io("the snapshot took too long".into()))?
        .ok()
        .flatten()
        .ok_or_else(|| AppError::Io("the page couldn't be captured".into()))
}

#[cfg(not(target_os = "macos"))]
async fn snapshot(_window: &tauri::WebviewWindow) -> AppResult<Vec<u8>> {
    snapshot_unsupported()
}

fn snapshot_unsupported() -> AppResult<Vec<u8>> {
    Err(AppError::InvalidInput(
        "page snapshots are only available on macOS so far".into(),
    ))
}
