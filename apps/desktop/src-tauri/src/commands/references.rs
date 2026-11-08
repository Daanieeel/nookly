use crate::db::references::{self, Probe, Reference, ReferenceStatus};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::moodle::service::MoodleState;
use tauri::State;

#[tauri::command]
pub fn create_reference(
    state: State<DbState>,
    space_id: String,
    provider: String,
    remote_id: String,
    title: Option<String>,
) -> AppResult<Reference> {
    let conn = state.conn()?;
    references::create_reference(&conn, space_id, &provider, &remote_id, title.as_deref())
}

#[tauri::command]
pub fn get_reference(state: State<DbState>, entity_id: String) -> AppResult<Reference> {
    let conn = state.conn()?;
    references::get_reference(&conn, &entity_id)
}

#[tauri::command]
pub fn list_references(state: State<DbState>, space_id: String) -> AppResult<Vec<Reference>> {
    let conn = state.conn()?;
    references::list_references(&conn, &space_id)
}

#[tauri::command]
pub fn retarget_reference(
    state: State<DbState>,
    entity_id: String,
    remote_id: String,
) -> AppResult<Reference> {
    let conn = state.conn()?;
    references::retarget(&conn, &entity_id, &remote_id)
}

/// Looks at the target of a reference now, on this device, and returns what it found.
/// Works for a reference entity and for a File that only points elsewhere. A file only
/// needs the disk, a link the network, and a Moodle object the signed in session. What
/// the look found is kept as the last known result; the state itself is never stored.
#[tauri::command]
pub async fn check_reference(
    state: State<'_, DbState>,
    moodle: State<'_, MoodleState>,
    entity_id: String,
) -> AppResult<ReferenceStatus> {
    let device = crate::db::device::current();
    let (provider, remote_id, local) = {
        let conn = state.conn()?;
        let facts = references::facts_for_device(&conn, &entity_id, &device)?
            .ok_or_else(|| AppError::NotFound(format!("reference {entity_id}")))?;
        let local = references::probe_local(&conn, &entity_id, &device)?;
        (facts.provider, facts.remote_id, local)
    };
    let (probe, title) = match provider.as_str() {
        references::PROVIDER_FILE => (local, None),
        references::PROVIDER_LINK => {
            let probe =
                tauri::async_runtime::spawn_blocking(move || references::probe_link(&remote_id))
                    .await
                    .unwrap_or(Probe::Unreachable);
            (probe, None)
        }
        _ => moodle.probe_reference(&provider, &remote_id).await,
    };
    let conn = state.conn()?;
    references::finish_check(&conn, &entity_id, probe, title.as_deref())
}
