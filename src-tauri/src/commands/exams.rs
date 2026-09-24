use crate::db::exams::{self, Exam};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_exam(
    state: State<DbState>,
    space_id: String,
    title: String,
    course_id: String,
    exam_date: Option<String>,
    weight: Option<f64>,
) -> AppResult<Exam> {
    let conn = state.0.lock().unwrap();
    exams::create_exam(&conn, space_id, title, course_id, exam_date, weight)
}

#[tauri::command]
pub fn list_exams(state: State<DbState>, space_id: String) -> AppResult<Vec<Exam>> {
    let conn = state.0.lock().unwrap();
    exams::list_exams(&conn, &space_id)
}

#[tauri::command]
pub fn list_exams_all_spaces(state: State<DbState>) -> AppResult<Vec<Exam>> {
    let conn = state.0.lock().unwrap();
    exams::list_exams_all_spaces(&conn)
}

#[tauri::command]
pub fn update_exam(
    state: State<DbState>,
    entity_id: String,
    grade: Option<f64>,
    status: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    exams::update_exam(&conn, &entity_id, grade, status)
}

#[tauri::command]
pub fn update_exam_date(
    state: State<DbState>,
    entity_id: String,
    exam_date: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    exams::update_exam_date(&conn, &entity_id, exam_date)
}

#[tauri::command]
pub fn update_exam_weight(
    state: State<DbState>,
    entity_id: String,
    weight: Option<f64>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    exams::update_exam_weight(&conn, &entity_id, weight)
}

#[tauri::command]
pub fn update_exam_grade(
    state: State<DbState>,
    entity_id: String,
    grade: Option<f64>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    exams::update_exam_grade(&conn, &entity_id, grade)
}

#[tauri::command]
pub fn update_exam_room(
    state: State<DbState>,
    entity_id: String,
    room: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    exams::update_exam_room(&conn, &entity_id, room)
}

#[tauri::command]
pub fn set_exam_course(
    state: State<DbState>,
    entity_id: String,
    course_id: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    exams::set_exam_course(&conn, &entity_id, course_id)
}
