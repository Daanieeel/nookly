//! Read only Moodle commands. See `moodle/` for what each one reads.

use crate::error::{AppError, AppResult};
use crate::moodle::model::*;
use crate::moodle::service::{Fetched, MoodleState, MoodleStatus};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn moodle_status(state: State<'_, MoodleState>) -> AppResult<MoodleStatus> {
    Ok(state.status().await)
}

/// Returns the Moodle sign in page to open in the browser.
#[tauri::command]
pub async fn moodle_begin_login(state: State<'_, MoodleState>, site: String) -> AppResult<String> {
    state.begin_login(&site).await
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
