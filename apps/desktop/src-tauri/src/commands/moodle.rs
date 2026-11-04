//! Read only Moodle commands. See `moodle/` for what each one reads.

use crate::error::{AppError, AppResult};
#[cfg(not(target_os = "macos"))]
use crate::moodle::login::{login_navigation, Navigation};
use crate::moodle::model::*;
use crate::moodle::service::{Fetched, MoodleState, MoodleStatus};
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(not(target_os = "macos"))]
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn moodle_status(state: State<'_, MoodleState>) -> AppResult<MoodleStatus> {
    Ok(state.status().await)
}

#[cfg(not(target_os = "macos"))]
const LOGIN_WINDOW: &str = "moodle-login";

/// Sent to the main window with the `nookly://token=...` link the sign in caught.
const CALLBACK_EVENT: &str = "moodle-callback";

/// Sent to the main window with the reason when the system's sign in sheet failed.
#[cfg(target_os = "macos")]
const FAILED_EVENT: &str = "moodle-login-failed";

/// Signs in inside Nookly, on the university's own login page, so single sign on and two step
/// login work. No browser has to hand Moodle's redirect to this app (browsers refuse that unless
/// a click started it): the redirect is caught here and sent to the main window.
///
/// On macOS that is the system's sign in sheet, which offers the passwords saved in Apple
/// Passwords. Elsewhere it is a window of our own: no access to Nookly's commands (the
/// capability is for the main window only), no cookies kept, https only.
#[tauri::command]
pub async fn moodle_open_login(
    app: AppHandle,
    state: State<'_, MoodleState>,
    site: String,
) -> AppResult<()> {
    let address = state.begin_login(&site).await?;
    let scheme = state.scheme().to_string();
    open_sign_in(&app, &address, &scheme).await
}

#[cfg(target_os = "macos")]
async fn open_sign_in(app: &AppHandle, address: &str, scheme: &str) -> AppResult<()> {
    use crate::moodle::native_login::{start, Outcome};

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Remote("Couldn't find the window to sign in from.".into()))?;
    let window = main
        .ns_window()
        .map_err(|e| AppError::Remote(format!("Couldn't open the sign in: {e}")))?
        as usize;
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (handle, address, scheme) = (app.clone(), address.to_string(), scheme.to_string());
    app.run_on_main_thread(move || {
        let Some(mtm) = objc2::MainThreadMarker::new() else {
            let _ = tx.send(Err("Couldn't open the sign in.".into()));
            return;
        };
        let emitter = handle.clone();
        // SAFETY: the pointer is the live main window's `NSWindow`.
        let started = unsafe {
            start(
                mtm,
                window as *mut std::ffi::c_void,
                &address,
                &scheme,
                move |outcome| match outcome {
                    Outcome::Link(link) => {
                        let _ = emitter.emit_to("main", CALLBACK_EVENT, link);
                        if let Some(main) = emitter.get_webview_window("main") {
                            let _ = main.set_focus();
                        }
                    }
                    Outcome::Failed(reason) => {
                        let _ = emitter.emit_to("main", FAILED_EVENT, reason);
                    }
                    Outcome::Cancelled => {}
                },
            )
        };
        let _ = tx.send(started);
    })
    .map_err(|e| AppError::Remote(format!("Couldn't open the sign in: {e}")))?;
    rx.await
        .map_err(|_| AppError::Remote("Couldn't open the sign in.".into()))?
        .map_err(AppError::Remote)
}

#[cfg(not(target_os = "macos"))]
async fn open_sign_in(app: &AppHandle, address: &str, scheme: &str) -> AppResult<()> {
    let url: url::Url = address
        .parse()
        .map_err(|_| AppError::Remote("That is not a Moodle address.".into()))?;
    let scheme = scheme.to_string();
    if let Some(open) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = open.close();
    }
    let handle = app.clone();
    WebviewWindowBuilder::new(app, LOGIN_WINDOW, WebviewUrl::External(url))
        .title("Sign in to Moodle")
        .inner_size(520.0, 760.0)
        .incognito(true)
        .on_navigation(move |target| match login_navigation(target, &scheme) {
            Navigation::Allow => true,
            Navigation::Callback(link) => {
                let _ = handle.emit_to("main", CALLBACK_EVENT, link);
                let handle = handle.clone();
                // Closing from inside the navigation callback would pull the window out from
                // under it.
                tauri::async_runtime::spawn(async move {
                    if let Some(window) = handle.get_webview_window(LOGIN_WINDOW) {
                        let _ = window.close();
                    }
                    if let Some(main) = handle.get_webview_window("main") {
                        let _ = main.set_focus();
                    }
                });
                false
            }
            Navigation::Block => false,
        })
        .build()
        .map_err(|e| AppError::Remote(format!("Couldn't open the sign in window: {e}")))?;
    Ok(())
}

/// `callback` is the `nookly://token=...` link Moodle redirects to, or what
/// follows `token=` in it.
#[tauri::command]
pub async fn moodle_finish_login(
    state: State<'_, MoodleState>,
    callback: String,
) -> AppResult<MoodleStatus> {
    state.finish_login(&callback).await
}

#[tauri::command]
pub async fn moodle_disconnect(state: State<'_, MoodleState>) -> AppResult<()> {
    state.disconnect().await
}

#[tauri::command]
pub async fn moodle_courses(state: State<'_, MoodleState>) -> AppResult<Fetched<Vec<Course>>> {
    state.courses().await
}

#[tauri::command]
pub async fn moodle_contents(
    state: State<'_, MoodleState>,
    course_id: i64,
) -> AppResult<Fetched<Vec<Section>>> {
    state.contents(course_id).await
}

#[tauri::command]
pub async fn moodle_assignments(
    state: State<'_, MoodleState>,
    course_id: i64,
) -> AppResult<Fetched<Vec<Assignment>>> {
    state.assignments(course_id).await
}

#[tauri::command]
pub async fn moodle_assignment_status(
    state: State<'_, MoodleState>,
    assignment_id: i64,
) -> AppResult<Fetched<AssignmentStatus>> {
    state.assignment_status(assignment_id).await
}

#[tauri::command]
pub async fn moodle_grades(
    state: State<'_, MoodleState>,
    course_id: i64,
) -> AppResult<Fetched<Vec<GradeItem>>> {
    state.grades(course_id).await
}

#[tauri::command]
pub async fn moodle_forums(
    state: State<'_, MoodleState>,
    course_id: i64,
) -> AppResult<Fetched<Vec<Forum>>> {
    state.forums(course_id).await
}

#[tauri::command]
pub async fn moodle_discussions(
    state: State<'_, MoodleState>,
    forum_id: i64,
) -> AppResult<Fetched<Vec<Discussion>>> {
    state.discussions(forum_id).await
}

#[tauri::command]
pub async fn moodle_posts(
    state: State<'_, MoodleState>,
    discussion_id: i64,
) -> AppResult<Fetched<Vec<Post>>> {
    state.posts(discussion_id).await
}

/// The body of a Moodle page (an `index.html` file on the site).
#[tauri::command]
pub async fn moodle_file_text(state: State<'_, MoodleState>, url: String) -> AppResult<String> {
    state.file_text(&url).await
}

/// Downloads a file (once) and opens it with the system's app for it.
#[tauri::command]
pub async fn moodle_open_file(
    app: AppHandle,
    state: State<'_, MoodleState>,
    url: String,
    file_name: String,
    time_modified: i64,
) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = state.download(&url, &file_name, time_modified).await?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}
