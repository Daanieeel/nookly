//! Ambient features (PLAN §11): run without being asked, the one deliberate
//! exception to the preview-and-confirm rule elsewhere in this module. Each
//! one only runs when its own Settings toggle is on, and defaults to an
//! on-device/local provider (`AiProviderConfig::is_ambient_default_eligible`)
//! unless the user opted a specific feature into a cloud provider.

use super::agent_loop::run_structured;
use super::provider::StructuredOutputSpec;
use super::{AiState, AutoTitleRecord};
use crate::error::AppResult;
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde_json::{json, Value};

const AUTO_TITLE_FEATURE: &str = "auto_title_jots";
const FILE_SUMMARY_FEATURE: &str = "summarize_files_on_upload";

/// A jot sitting untitled this long is a candidate for auto-titling.
const UNTITLED_THRESHOLD_MINUTES: i64 = 15;

/// How often the background sweep checks for untitled jots and unsummarized
/// files. Both passes are cheap no-ops when their toggle is off or nothing
/// qualifies, so a modest interval is fine.
const SWEEP_INTERVAL: std::time::Duration = std::time::Duration::from_secs(600);

/// Started once from `lib.rs::setup`, alongside `db::watch_external_changes`.
/// Runs both ambient passes on a timer for the app's whole lifetime; any
/// failure is swallowed; there is nothing to crash over here (PLAN §11: each
/// feature is a toggle, never a requirement).
pub fn spawn_periodic_sweep(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(SWEEP_INTERVAL).await;
            // A provider call inside a pass can construct and drop a
            // `reqwest::blocking::Client` (its own small internal Tokio
            // runtime), which panics if that happens directly on this async
            // task's Tokio worker thread — hence the blocking pool, not an
            // inline call, even though this loop already `.await`s.
            let app_for_pass = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || run_sweep_once(&app_for_pass)).await;
        }
    });
}

fn run_sweep_once(app: &tauri::AppHandle) {
    use tauri::Manager;
    let db_state = app.state::<crate::db::DbState>();
    let ai_state = app.state::<AiState>();
    let Ok(conn) = db_state.0.lock() else { return };
    let _ = run_auto_title_pass(app, &conn, &ai_state);
    let _ = run_file_summary_pass(app, &conn, &ai_state);
}

fn minutes_since(timestamp: &str) -> Option<i64> {
    let then = DateTime::parse_from_rfc3339(timestamp).ok()?.with_timezone(&Utc);
    Some((Utc::now() - then).num_minutes())
}

/// Generates a short title for every jot that's been untitled long enough,
/// via structured generation, and applies it through the same
/// `entities::update_entity` path any other title edit uses. Returns one
/// summary object per jot titled, for the caller (a periodic task or the
/// on-demand Tauri command) to log.
pub fn run_auto_title_pass(app: &tauri::AppHandle, conn: &Connection, ai_state: &AiState) -> AppResult<Vec<Value>> {
    if !ai_state.ambient().auto_title_jots {
        return Ok(Vec::new());
    }
    let Some(provider_id) = ai_state.ambient_provider_id(AUTO_TITLE_FEATURE) else {
        return Ok(Vec::new());
    };
    let Ok(provider_config) = ai_state.provider_config(&provider_id) else {
        return Ok(Vec::new());
    };

    let candidates: Vec<_> = crate::db::entities::list_entities(conn, None, false)?
        .into_iter()
        .filter(|e| e.entity_type == "jot")
        .filter(|e| e.title.trim().is_empty())
        .filter(|e| minutes_since(&e.updated_at).is_some_and(|m| m >= UNTITLED_THRESHOLD_MINUTES))
        .collect();

    let mut applied = Vec::new();
    for entity in candidates {
        let Ok(markdown) = crate::db::notes::render_page_markdown(conn, &entity.id) else {
            continue;
        };
        let trimmed = markdown.trim();
        if trimmed.is_empty() {
            continue;
        }
        let prompt = format!(
            "Write a short title (under 8 words, no punctuation at the end) for this note:\n\n{}",
            &trimmed[..trimmed.len().min(2000)]
        );
        let schema = json!({
            "type": "object",
            "properties": { "title": { "type": "string" } },
            "required": ["title"],
            "additionalProperties": false,
        });
        let Ok(result) = run_structured(
            app,
            ai_state,
            &provider_id,
            provider_config.default_model.as_deref().unwrap_or_default(),
            &prompt,
            StructuredOutputSpec { name: "title".into(), schema },
        ) else {
            continue;
        };
        let Some(new_title) = result.get("title").and_then(Value::as_str) else { continue };
        let new_title = new_title.trim();
        if new_title.is_empty() {
            continue;
        }
        let updated = crate::db::entities::update_entity(
            conn,
            &entity.id,
            crate::db::entities::EntityPatch { title: Some(new_title.to_string()), ..Default::default() },
        )?;
        let record = AutoTitleRecord {
            entity_id: entity.id.clone(),
            entity_key: updated.key.clone(),
            previous_title: entity.title.clone(),
            new_title: new_title.to_string(),
            applied_at: crate::db::now(),
        };
        ai_state.record_auto_title(record.clone())?;
        applied.push(json!({
            "entityId": record.entity_id,
            "entityKey": record.entity_key,
            "newTitle": record.new_title,
        }));
    }
    Ok(applied)
}

/// Reverts one auto-title, restoring the jot's previous title (which is
/// usually empty — undoing just clears it back to untitled).
pub fn undo_auto_title(conn: &Connection, ai_state: &AiState, entity_id: &str) -> AppResult<bool> {
    let Some(record) = ai_state.take_auto_title_record(entity_id)? else {
        return Ok(false);
    };
    crate::db::entities::update_entity(
        conn,
        &record.entity_id,
        crate::db::entities::EntityPatch { title: Some(record.previous_title), ..Default::default() },
    )?;
    Ok(true)
}

/// Summarizes every File with extracted/OCR'd text but no summary yet
/// (mirrors `db::files::reindex_missing`'s "only touches what needs it"
/// shape), so the File page and search can show a short summary alongside the
/// full extracted text.
pub fn run_file_summary_pass(app: &tauri::AppHandle, conn: &Connection, ai_state: &AiState) -> AppResult<Vec<Value>> {
    if !ai_state.ambient().summarize_files_on_upload {
        return Ok(Vec::new());
    }
    let Some(provider_id) = ai_state.ambient_provider_id(FILE_SUMMARY_FEATURE) else {
        return Ok(Vec::new());
    };
    let Ok(provider_config) = ai_state.provider_config(&provider_id) else {
        return Ok(Vec::new());
    };

    let Some(def) = crate::db::schema::lookup("file") else { return Ok(Vec::new()) };
    let Ok(files) = (def.list)(conn, None, false) else { return Ok(Vec::new()) };

    let mut applied = Vec::new();
    for file in files {
        let Some(id) = crate::db::schema::payload_id(&file) else { continue };
        if ai_state.file_summary(&id).is_some() {
            continue;
        }
        let Ok(full) = (def.get)(conn, &id) else { continue };
        let text = full.get("indexedContent").and_then(Value::as_str).unwrap_or_default();
        if text.trim().is_empty() {
            continue;
        }
        let prompt = format!(
            "Summarize this file's content in 1-2 plain sentences:\n\n{}",
            &text[..text.len().min(4000)]
        );
        let schema = json!({
            "type": "object",
            "properties": { "summary": { "type": "string" } },
            "required": ["summary"],
            "additionalProperties": false,
        });
        let Ok(result) = run_structured(
            app,
            ai_state,
            &provider_id,
            provider_config.default_model.as_deref().unwrap_or_default(),
            &prompt,
            StructuredOutputSpec { name: "summary".into(), schema },
        ) else {
            continue;
        };
        let Some(summary) = result.get("summary").and_then(Value::as_str) else { continue };
        if summary.trim().is_empty() {
            continue;
        }
        ai_state.set_file_summary(&id, summary.trim().to_string())?;
        applied.push(json!({ "fileId": id, "summary": summary.trim() }));
    }
    Ok(applied)
}
