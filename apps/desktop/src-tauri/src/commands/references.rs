use crate::db::references::{self, Probe, ReferenceStatus};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::moodle::service::MoodleState;
use tauri::State;

/// Looks at where a File points now, on this device, and returns what it found. A file only
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
