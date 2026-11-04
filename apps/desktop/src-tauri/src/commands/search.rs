use crate::db::search::{self, SearchHit, SearchRequest};
use crate::db::DbState;
use crate::error::AppResult;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::State;

/// The newest search the window asked for. A search that finds a newer one here
/// gives up, so typing never queues work behind answers nobody will read.
static LATEST_SEARCH: AtomicU64 = AtomicU64::new(0);

/// SQLite runs this every this many VM steps while a search runs.
const CANCEL_CHECK_STEPS: i32 = 2000;

/// One ranked list for the search surfaces (Cmd+K and Cmd+P). Deliberately not
/// Space-scoped by default (§6). `request_id` grows with every keystroke: a search
/// with a lower one than another seen is stale, and answers empty at once.
#[tauri::command]
pub async fn search(
    state: State<'_, DbState>,
    request: SearchRequest,
    request_id: Option<u64>,
) -> AppResult<Vec<SearchHit>> {
    let id = request_id.unwrap_or(0);
    if id != 0 && LATEST_SEARCH.fetch_max(id, Ordering::SeqCst) > id {
        return Ok(Vec::new());
    }
    let conn = state.conn()?;
    if id == 0 {
        return search::search_ranked(&conn, &request);
    }
    conn.progress_handler(
        CANCEL_CHECK_STEPS,
        Some(move || LATEST_SEARCH.load(Ordering::Relaxed) > id),
    );
    let result = search::search_ranked(&conn, &request);
    conn.progress_handler(0, None::<fn() -> bool>);
    match result {
        Err(_) if LATEST_SEARCH.load(Ordering::SeqCst) > id => Ok(Vec::new()),
        other => other,
    }
}
