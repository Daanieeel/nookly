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
) -> AppResult<Assignment> {
    let conn = state.0.lock().unwrap();
    assignments::create_assignment(&conn, space_id, title, course_id, due_date)
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
