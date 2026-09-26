use crate::db::calendar::{
    self, CalendarEntry, CalendarEntryOverride, CalendarEntrySeriesPatch, CalendarEntryTemplate,
};
use crate::db::entities::Entity;
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_calendar_entry_template(
    state: State<DbState>,
    space_id: String,
    title: String,
    recurrence: String,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
    anchor_date: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    calendar::create_calendar_entry_template(
        &conn,
        space_id,
        title,
        recurrence,
        start_time,
        end_time,
        all_day,
        location,
        description,
        anchor_date,
    )
}

#[tauri::command]
pub fn generate_calendar_entry_occurrences(
    state: State<DbState>,
    template_id: String,
    until_date: String,
) -> AppResult<Vec<CalendarEntry>> {
    let conn = state.0.lock().unwrap();
    calendar::generate_occurrences(&conn, &template_id, &until_date)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_one_off_calendar_entry(
    state: State<DbState>,
    space_id: String,
    title: String,
    date: String,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
) -> AppResult<CalendarEntry> {
    let conn = state.0.lock().unwrap();
    calendar::create_one_off_calendar_entry(
        &conn,
        space_id,
        title,
        date,
        start_time,
        end_time,
        all_day,
        location,
        description,
    )
}

#[tauri::command]
pub fn override_calendar_entry_occurrence(
    state: State<DbState>,
    entity_id: String,
    patch: CalendarEntryOverride,
) -> AppResult<CalendarEntry> {
    let conn = state.0.lock().unwrap();
    calendar::override_occurrence(&conn, &entity_id, patch)
}

#[tauri::command]
pub fn list_calendar_entries(
    state: State<DbState>,
    space_id: String,
) -> AppResult<Vec<CalendarEntry>> {
    let conn = state.0.lock().unwrap();
    calendar::list_calendar_entries(&conn, Some(&space_id))
}

/// Every calendar entry across every Space, for the unified cross-Space Calendar page.
#[tauri::command]
pub fn list_calendar_entries_all(state: State<DbState>) -> AppResult<Vec<CalendarEntry>> {
    let conn = state.0.lock().unwrap();
    calendar::list_calendar_entries(&conn, None)
}

#[tauri::command]
pub fn list_calendar_entry_templates(
    state: State<DbState>,
    space_id: String,
) -> AppResult<Vec<CalendarEntryTemplate>> {
    let conn = state.0.lock().unwrap();
    calendar::list_calendar_entry_templates(&conn, &space_id)
}

#[tauri::command]
pub fn update_calendar_entry_series(
    state: State<DbState>,
    template_id: String,
    from_date: String,
    patch: CalendarEntrySeriesPatch,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    calendar::update_calendar_entry_series(&conn, &template_id, &from_date, patch)
}

#[tauri::command]
pub fn delete_calendar_entry_series(
    state: State<DbState>,
    template_id: String,
    from_date: String,
) -> AppResult<usize> {
    let conn = state.0.lock().unwrap();
    calendar::delete_calendar_entry_series(&conn, &template_id, &from_date)
}
