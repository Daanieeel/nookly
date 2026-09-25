use crate::db::tasks::{self, Task, TaskStatus};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn list_task_statuses(state: State<DbState>) -> AppResult<Vec<TaskStatus>> {
    let conn = state.0.lock().unwrap();
    tasks::list_task_statuses(&conn)
}

#[tauri::command]
pub fn create_task(
    state: State<DbState>,
    space_id: String,
    title: String,
    start_date: Option<String>,
    due_date: Option<String>,
) -> AppResult<Task> {
    let conn = state.0.lock().unwrap();
    tasks::create_task(&conn, space_id, title, start_date, due_date)
}

#[tauri::command]
pub fn create_subtask(
    state: State<DbState>,
    parent_entity_id: String,
    title: String,
) -> AppResult<Task> {
    let conn = state.0.lock().unwrap();
    tasks::create_subtask(&conn, parent_entity_id, title)
}

#[tauri::command]
pub fn list_subtasks(state: State<DbState>, parent_entity_id: String) -> AppResult<Vec<Task>> {
    let conn = state.0.lock().unwrap();
    tasks::list_subtasks(&conn, &parent_entity_id)
}

#[tauri::command]
pub fn subtask_progress(state: State<DbState>, parent_entity_id: String) -> AppResult<Option<f64>> {
    let conn = state.0.lock().unwrap();
    tasks::subtask_progress(&conn, &parent_entity_id)
}

#[tauri::command]
pub fn get_task(state: State<DbState>, entity_id: String) -> AppResult<Task> {
    let conn = state.0.lock().unwrap();
    tasks::get_task_with_labels(&conn, &entity_id)
}

#[tauri::command]
pub fn list_tasks(state: State<DbState>, space_id: String) -> AppResult<Vec<Task>> {
    let conn = state.0.lock().unwrap();
    tasks::list_tasks(&conn, &space_id)
}

#[tauri::command]
pub fn update_task_status(
    state: State<DbState>,
    entity_id: String,
    status_id: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    tasks::update_task_status(&conn, &entity_id, &status_id)
}

#[tauri::command]
pub fn count_tasks_due_today(state: State<DbState>) -> AppResult<tasks::TaskDueTodaySummary> {
    let conn = state.0.lock().unwrap();
    tasks::count_tasks_due_today(&conn)
}

#[tauri::command]
pub fn list_open_tasks_due_or_overdue(state: State<DbState>) -> AppResult<Vec<tasks::Task>> {
    let conn = state.0.lock().unwrap();
    tasks::list_open_tasks_due_or_overdue(&conn)
}

#[tauri::command]
pub fn count_open_tasks_due_or_overdue(state: State<DbState>) -> AppResult<i64> {
    let conn = state.0.lock().unwrap();
    tasks::count_open_tasks_due_or_overdue(&conn)
}

#[tauri::command]
pub fn update_task_dates(
    state: State<DbState>,
    entity_id: String,
    start_date: Option<String>,
    due_date: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    tasks::update_task_dates(&conn, &entity_id, start_date, due_date)
}

#[tauri::command]
pub fn convert_to_subtask(
    state: State<DbState>,
    entity_id: String,
    parent_entity_id: String,
) -> AppResult<Task> {
    let conn = state.0.lock().unwrap();
    tasks::convert_to_subtask(&conn, &entity_id, &parent_entity_id)
}
