//! Tauri commands for the AI assistant: provider setup (Settings → AI),
//! availability, and running/resuming a conversation. Streaming goes out as
//! `AppHandle::emit` events on `ai:stream:<conversationId>`, the same
//! event-per-progress pattern `commands::office_install` already uses.

use crate::ai::agent_loop::{self, Conversation, ConversationSummary};
use crate::ai::ambient;
use crate::ai::study::{self, QuizQuestion};
use crate::ai::AutoTitleRecord;
use crate::ai::provider::{ModelInfo, ProviderCapabilities, StreamEvent, StreamSink};
use crate::ai::{AiProviderConfig, AiState, AmbientSettings, ProviderAvailability, ProviderKind};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};

struct EmitSink {
    app: AppHandle,
    event: String,
}

impl StreamSink for EmitSink {
    fn send(&mut self, event: StreamEvent) {
        let _ = self.app.emit(&self.event, event);
    }
}

fn stream_event_name(conversation_id: &str) -> String {
    format!("ai:stream:{conversation_id}")
}

#[tauri::command]
pub fn ai_availability(app: AppHandle, state: State<AiState>) -> Vec<ProviderAvailability> {
    crate::ai::availability(&state, &app)
}

#[tauri::command]
pub fn ai_list_providers(state: State<AiState>) -> Vec<AiProviderConfig> {
    state.list_providers()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddProviderInput {
    pub id: Option<String>,
    pub kind: ProviderKind,
    pub label: String,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
    pub api_key: Option<String>,
    /// Set once the user has seen the cloud-provider notice (PLAN §3.4).
    pub cloud_notice_acknowledged: bool,
}

#[tauri::command]
pub fn ai_add_provider(state: State<AiState>, input: AddProviderInput) -> AppResult<AiProviderConfig> {
    let config = AiProviderConfig {
        id: input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        kind: input.kind,
        label: input.label,
        base_url: input.base_url,
        default_model: input.default_model,
        cloud_notice_acknowledged: input.cloud_notice_acknowledged,
    };
    if config.is_cloud() && !config.cloud_notice_acknowledged {
        return Err(AppError::InvalidInput(
            "acknowledge what gets sent to a cloud provider before adding it".into(),
        ));
    }
    state.upsert_provider(config.clone(), input.api_key.as_deref())?;
    Ok(config)
}

#[tauri::command]
pub fn ai_remove_provider(state: State<AiState>, id: String) -> AppResult<()> {
    state.remove_provider(&id)
}

#[tauri::command]
pub fn ai_set_default_provider(state: State<AiState>, id: String) -> AppResult<()> {
    state.set_default_provider(&id)
}

#[tauri::command]
pub fn ai_default_provider_id(state: State<AiState>) -> Option<String> {
    state.default_provider_id()
}

#[tauri::command]
pub fn ai_set_provider_model(state: State<AiState>, id: String, model: String) -> AppResult<()> {
    state.set_provider_model(&id, &model)
}

/// What the composer/settings UI shows about a provider before use: whether it
/// streams, calls tools, generates structured output, and its rough context
/// budget (PLAN §3.1 — a large cloud model gets more of a note or more search
/// results per request than the small on-device one).
#[tauri::command]
pub fn ai_provider_capabilities(app: AppHandle, state: State<AiState>, id: String) -> AppResult<ProviderCapabilities> {
    Ok(state.build_provider(&app, &id)?.capabilities())
}

#[tauri::command]
pub async fn ai_list_models(app: AppHandle, state: State<'_, AiState>, id: String) -> AppResult<Vec<ModelInfo>> {
    let provider = state.build_provider(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || provider.list_models())
        .await
        .map_err(|e| AppError::Remote(e.to_string()))?
}

#[tauri::command]
pub async fn ai_test_provider(app: AppHandle, state: State<'_, AiState>, id: String) -> AppResult<bool> {
    ai_list_models(app, state, id).await.map(|models| !models.is_empty())
}

/// Reads a plain text file the user picked with the native file dialog (a
/// Cowork `PROFILE.md`, PLAN §5) so the Settings UI can show it for editing
/// before it's condensed and saved. Read only; the file itself is never
/// copied or watched, matching "the app can't see the Cowork folder on its
/// own, so import is always a deliberate pick."
#[tauri::command]
pub fn ai_read_profile_file(path: String) -> AppResult<String> {
    std::fs::read_to_string(&path).map_err(|e| AppError::Io(format!("{path}: {e}")))
}

#[tauri::command]
pub fn ai_get_profile(state: State<AiState>) -> Option<String> {
    state.profile_block()
}

#[tauri::command]
pub fn ai_set_profile(state: State<AiState>, block: String) -> AppResult<()> {
    state.set_profile_block(block)
}

#[tauri::command]
pub fn ai_get_ambient(state: State<AiState>) -> AmbientSettings {
    state.ambient()
}

#[tauri::command]
pub fn ai_set_ambient(state: State<AiState>, ambient: AmbientSettings) -> AppResult<()> {
    state.set_ambient(ambient)
}

/// Runs the auto-title sweep immediately instead of waiting for the next
/// timer tick — used by Settings → AI's "Run now", and by tests.
///
/// Runs on the blocking thread pool, not inline on the async runtime worker
/// that dispatches this command: a provider call here can construct and drop
/// a `reqwest::blocking::Client` (its own small internal Tokio runtime),
/// which panics with "Cannot drop a runtime in a context where blocking is
/// not allowed" if that happens directly on a Tokio worker thread — and
/// since that would happen while this command still holds `DbState`'s mutex
/// locked, the panic poisons it, cascading into every other command that
/// touches the database next.
#[tauri::command]
pub async fn ai_run_auto_title_now(app: AppHandle) -> AppResult<Vec<serde_json::Value>> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app.state::<DbState>();
        let ai_state = app.state::<AiState>();
        let conn = db_state.0.lock().unwrap();
        ambient::run_auto_title_pass(&app, &conn, &ai_state)
    })
    .await
    .map_err(|e| AppError::Remote(e.to_string()))?
}

#[tauri::command]
pub fn ai_auto_title_log(state: State<AiState>) -> Vec<AutoTitleRecord> {
    state.auto_title_log()
}

#[tauri::command]
pub fn ai_undo_auto_title(db_state: State<DbState>, ai_state: State<AiState>, entity_id: String) -> AppResult<bool> {
    let conn = db_state.0.lock().unwrap();
    ambient::undo_auto_title(&conn, &ai_state, &entity_id)
}

/// Blocking-pool rationale: see `ai_run_auto_title_now`.
#[tauri::command]
pub async fn ai_run_file_summary_now(app: AppHandle) -> AppResult<Vec<serde_json::Value>> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app.state::<DbState>();
        let ai_state = app.state::<AiState>();
        let conn = db_state.0.lock().unwrap();
        ambient::run_file_summary_pass(&app, &conn, &ai_state)
    })
    .await
    .map_err(|e| AppError::Remote(e.to_string()))?
}

#[tauri::command]
pub fn ai_file_summary(state: State<AiState>, file_id: String) -> Option<String> {
    state.file_summary(&file_id)
}

/// "Quiz me" (PLAN §7.1/§8.5): structured generation, no tool loop, nothing
/// saved until the quiz UI's own (previewed) "turn misses into flashcards".
/// Blocking-pool rationale: see `ai_run_auto_title_now`.
#[tauri::command]
pub async fn ai_generate_quiz(app: AppHandle, entity_id: String, count: u32) -> AppResult<Vec<QuizQuestion>> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app.state::<DbState>();
        let ai_state = app.state::<AiState>();
        let conn = db_state.0.lock().unwrap();
        study::generate_quiz(&app, &conn, &ai_state, &entity_id, count)
    })
    .await
    .map_err(|e| AppError::Remote(e.to_string()))?
}

#[tauri::command]
pub fn ai_list_conversations(state: State<AiState>) -> Vec<ConversationSummary> {
    state.list_conversations()
}

#[tauri::command]
pub fn ai_get_conversation(state: State<AiState>, id: String) -> Option<Conversation> {
    state.get_conversation(&id)
}

#[tauri::command]
pub fn ai_new_conversation(
    state: State<AiState>,
    provider_id: Option<String>,
    model: String,
) -> AppResult<Conversation> {
    let provider_id = provider_id
        .or_else(|| state.default_provider_id())
        .ok_or_else(|| AppError::InvalidInput("no AI provider is configured yet".into()))?;
    let conversation = Conversation::new(uuid::Uuid::new_v4().to_string(), provider_id, model);
    state.save_conversation(conversation.clone())?;
    Ok(conversation)
}

#[tauri::command]
pub fn ai_delete_conversation(state: State<AiState>, id: String) -> AppResult<()> {
    state.delete_conversation(&id)
}

#[tauri::command]
pub fn ai_clear_conversations(state: State<AiState>) -> AppResult<()> {
    state.clear_conversations()
}

/// Blocking-pool rationale: see `ai_run_auto_title_now`. This is the hot path
/// that hit it in practice — every provider call in the tool-calling loop
/// goes through here.
#[tauri::command]
pub async fn ai_send_message(app: AppHandle, conversation_id: String, text: String) -> AppResult<Conversation> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app.state::<DbState>();
        let ai_state = app.state::<AiState>();
        let event = stream_event_name(&conversation_id);
        let mut sink = EmitSink { app: app.clone(), event };
        let conn = db_state.0.lock().unwrap();
        let mut conversation = ai_state
            .get_conversation(&conversation_id)
            .ok_or_else(|| AppError::NotFound(format!("conversation {conversation_id}")))?;
        agent_loop::send_message(&app, &conn, &ai_state, &mut conversation, text, &mut sink)?;
        Ok(conversation)
    })
    .await
    .map_err(|e| AppError::Remote(e.to_string()))?
}

/// Blocking-pool rationale: see `ai_run_auto_title_now`.
#[tauri::command]
pub async fn ai_resolve_pending(
    app: AppHandle,
    conversation_id: String,
    decisions: HashMap<String, bool>,
) -> AppResult<Conversation> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app.state::<DbState>();
        let ai_state = app.state::<AiState>();
        let event = stream_event_name(&conversation_id);
        let mut sink = EmitSink { app: app.clone(), event };
        let conn = db_state.0.lock().unwrap();
        let mut conversation = ai_state
            .get_conversation(&conversation_id)
            .ok_or_else(|| AppError::NotFound(format!("conversation {conversation_id}")))?;
        agent_loop::resolve_pending(&app, &conn, &ai_state, &mut conversation, &decisions, &mut sink)?;
        Ok(conversation)
    })
    .await
    .map_err(|e| AppError::Remote(e.to_string()))?
}
