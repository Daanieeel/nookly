use crate::db::courses;
use crate::db::entities::Entity;
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_course(state: State<DbState>, space_id: String, title: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    courses::create_course(&conn, space_id, title)
}

#[tauri::command]
pub fn list_courses(state: State<DbState>, space_id: String) -> AppResult<Vec<Entity>> {
    let conn = state.0.lock().unwrap();
    courses::list_courses(&conn, &space_id)
}

#[tauri::command]
pub fn create_semester(
    state: State<DbState>,
    space_id: String,
    title: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    courses::create_semester(&conn, space_id, title)
}

#[tauri::command]
pub fn list_semesters(state: State<DbState>, space_id: String) -> AppResult<Vec<Entity>> {
    let conn = state.0.lock().unwrap();
    courses::list_semesters(&conn, &space_id)
}

#[tauri::command]
pub fn link_course_to_semester(
    state: State<DbState>,
    course_id: String,
    semester_id: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    courses::link_course_to_semester(&conn, course_id, semester_id)
}
