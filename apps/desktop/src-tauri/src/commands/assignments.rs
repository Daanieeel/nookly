use crate::db::assignments::{self, Assignment};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_assignment(
    state: State<DbState>,
    space_id: String,
    title: String,
    course_id: String,
    due_date: Option<String>,
    due_session_offset_days: Option<i64>,
    due_session_id: Option<String>,
) -> AppResult<Assignment> {
    let conn = state.0.lock().unwrap();
    match due_session_offset_days {
        Some(days) => assignments::create_assignment_due_before_session(
            &conn,
            space_id,
            title,
            course_id,
            days,
            due_session_id,
        ),
        None => assignments::create_assignment(&conn, space_id, title, course_id, due_date),
    }
}

#[tauri::command]
pub fn list_assignments(state: State<DbState>, space_id: String) -> AppResult<Vec<Assignment>> {
    let conn = state.0.lock().unwrap();
    assignments::list_assignments(&conn, &space_id)
}

#[tauri::command]
pub fn list_assignments_all_spaces(state: State<DbState>) -> AppResult<Vec<Assignment>> {
    let conn = state.0.lock().unwrap();
    assignments::list_assignments_all_spaces(&conn)
}

#[tauri::command]
pub fn update_assignment_status(
    state: State<DbState>,
    entity_id: String,
    status: String,
    grade: Option<f64>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    assignments::update_assignment_status(&conn, &entity_id, status, grade)
}

#[tauri::command]
pub fn update_assignment_due_date(
    state: State<DbState>,
    entity_id: String,
    due_date: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    assignments::update_assignment_due_date(&conn, &entity_id, due_date)
}

#[tauri::command]
pub fn set_assignment_course(
    state: State<DbState>,
    entity_id: String,
    course_id: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    assignments::set_assignment_course(&conn, &entity_id, course_id)
}

#[tauri::command]
pub fn update_assignment_due_before_session(
    state: State<DbState>,
    entity_id: String,
    offset_days: Option<i64>,
    session_id: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    assignments::update_assignment_due_before_session(&conn, &entity_id, offset_days, session_id)
}

#[tauri::command]
pub fn update_assignment_weight(
    state: State<DbState>,
    entity_id: String,
    weight: Option<f64>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    assignments::update_assignment_weight(&conn, &entity_id, weight)
}
