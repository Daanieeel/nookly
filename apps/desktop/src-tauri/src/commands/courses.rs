use crate::db::courses::{self, CourseGrades, Semester};
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
    start_date: Option<String>,
    end_date: Option<String>,
    term_type: Option<String>,
    year: Option<i64>,
) -> AppResult<Semester> {
    let conn = state.0.lock().unwrap();
    courses::create_semester(
        &conn, space_id, title, start_date, end_date, term_type, year,
    )
}

#[tauri::command]
pub fn list_semesters(state: State<DbState>, space_id: String) -> AppResult<Vec<Semester>> {
    let conn = state.0.lock().unwrap();
    courses::list_semesters(&conn, &space_id)
}

#[tauri::command]
pub fn update_semester(
    state: State<DbState>,
    entity_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
    term_type: Option<String>,
    year: Option<i64>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    courses::update_semester(&conn, &entity_id, start_date, end_date, term_type, year)
}

#[tauri::command]
pub fn set_current_semester(
    state: State<DbState>,
    space_id: String,
    entity_id: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    courses::set_current_semester(&conn, &space_id, &entity_id)
}

#[tauri::command]
pub fn reorder_semesters(state: State<DbState>, ordered_ids: Vec<String>) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    courses::reorder_semesters(&conn, ordered_ids)
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

#[tauri::command]
pub fn set_course_semester(
    state: State<DbState>,
    course_id: String,
    semester_id: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    courses::set_course_semester(&conn, &course_id, semester_id)
}

#[tauri::command]
pub fn get_course_notes(state: State<DbState>, course_id: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    courses::get_or_create_course_notes(&conn, &course_id)
}

#[tauri::command]
pub fn get_semester_notes(state: State<DbState>, semester_id: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    courses::get_or_create_semester_notes(&conn, &semester_id)
}

#[tauri::command]
pub fn get_course_grades(state: State<DbState>, course_id: String) -> AppResult<CourseGrades> {
    let conn = state.0.lock().unwrap();
    courses::get_course_grades(&conn, &course_id)
}
