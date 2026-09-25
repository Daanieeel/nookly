use crate::db::study_blocks::{self, StudyBlock};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_study_block(
    state: State<DbState>,
    space_id: String,
    title: String,
    exam_id: String,
    date: String,
    start_time: String,
    end_time: String,
) -> AppResult<StudyBlock> {
    let conn = state.0.lock().unwrap();
    study_blocks::create_study_block(&conn, space_id, title, exam_id, date, start_time, end_time)
}

#[tauri::command]
pub fn list_study_blocks(state: State<DbState>, space_id: String) -> AppResult<Vec<StudyBlock>> {
    let conn = state.0.lock().unwrap();
    study_blocks::list_study_blocks(&conn, &space_id)
}
