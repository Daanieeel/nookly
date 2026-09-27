//! The tool-calling loop: builds the system prompt, calls the active
//! provider, runs read tools immediately, and pauses on any write tool for
//! confirmation (PLAN §4.3) before ever calling `tools::call` with
//! `dry_run: false`.
//!
//! A conversation is not an entity (PLAN §9) — it's a plain JSON-serializable
//! struct persisted by `AiState` in its own local file, never in `nookly.db`,
//! never synced, clearable from the Assistant page.

use super::provider::{
    CompletionRequest, Message, StreamEvent, StreamSink, StructuredOutputSpec, ToolCall, ToolResult,
};
use super::{tools, AiState};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One tool call from the model's last turn, either already resolved (a read,
/// which runs freely) or awaiting the user's confirm/cancel (a write, shown
/// as a preview card).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingToolCall {
    pub tool_call: ToolCall,
    pub is_write: bool,
    /// A write's dry-run result, or a read's real (already-applied) result.
    pub preview: Value,
    /// `None` while a write awaits a decision. Reads are pre-filled `Some(true)`.
    pub resolved: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    pub provider_id: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub messages: Vec<Message>,
    /// Non-empty exactly when the loop is paused on at least one write tool
    /// call awaiting confirmation.
    #[serde(default)]
    pub pending: Vec<PendingToolCall>,
}

impl Conversation {
    pub fn new(id: String, provider_id: String, model: String) -> Self {
        let now = crate::db::now();
        Self { id, title: None, provider_id, model, created_at: now.clone(), updated_at: now, messages: Vec::new(), pending: Vec::new() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: Option<String>,
    pub provider_id: String,
    pub updated_at: String,
    pub awaiting_confirmation: bool,
}

impl From<&Conversation> for ConversationSummary {
    fn from(c: &Conversation) -> Self {
        Self {
            id: c.id.clone(),
            title: c.title.clone(),
            provider_id: c.provider_id.clone(),
            updated_at: c.updated_at.clone(),
            awaiting_confirmation: c.pending.iter().any(|p| p.is_write && p.resolved.is_none()),
        }
    }
}

/// Collects every `StreamEvent` while still forwarding it live to the real
/// sink, so the loop can inspect the outcome after the stream ends.
struct Collector<'a> {
    events: Vec<StreamEvent>,
    sink: &'a mut dyn StreamSink,
}

impl StreamSink for Collector<'_> {
    fn send(&mut self, event: StreamEvent) {
        self.sink.send(event.clone());
        self.events.push(event);
    }
}

/// The assistant's writing rules, sourced directly from `AGENTS.md`'s
/// existing copy rule (no separate `STYLE.md` exists in this repo) — verdict
/// first, no filler, never an em/en dash or a hyphenated sentence structure.
const COPY_STYLE: &str = "Write plainly: state the answer or result first, then the reasoning only if it \
    helps. Never use an em dash or en dash, and avoid hyphenated sentence structure. No filler, no hedging.";

fn system_prompt(ai_state: &AiState) -> String {
    let mut sections = vec![
        "You are the Nookly Assistant, built into the Nookly app. You have full read and write access to \
         the user's data through a small set of generic tools (describe, schema, search, list, get, create, \
         update, delete, restore, relate, unrelate, run_action, navigate) — never guess the data model, call \
         `schema` or `describe` first. Every write is previewed and confirmed by the user before it takes \
         effect; only describe/schema/search/list/get/navigate run immediately."
            .to_string(),
        COPY_STYLE.to_string(),
    ];
    if let Some(profile) = ai_state.profile_block() {
        sections.push(format!("About the user:\n{profile}"));
    }
    sections.join("\n\n")
}

fn build_request_messages(ai_state: &AiState, conversation: &Conversation) -> Vec<Message> {
    let mut messages = vec![Message::system(system_prompt(ai_state))];
    messages.extend(conversation.messages.iter().cloned());
    messages
}

/// Runs `preview`-or-apply for one tool call and wraps it as a
/// `PendingToolCall`. Reads execute for real immediately (PLAN §4.3: "reads
/// and navigate run freely") since they have no side effects to preview.
fn resolve_one(conn: &Connection, call: &ToolCall) -> PendingToolCall {
    let is_write = tools::is_write_tool(&call.name);
    let result = tools::call(conn, &call.name, &call.arguments, is_write);
    let (preview, resolved) = match result {
        Ok(value) => (value, (!is_write).then_some(true)),
        Err(e) => (serde_json::json!({ "error": e }), (!is_write).then_some(true)),
    };
    PendingToolCall { tool_call: call.clone(), is_write, preview, resolved }
}

fn pending_to_tool_result(conn: &Connection, pending: &PendingToolCall) -> ToolResult {
    // A confirmed write is applied for real here, not at preview time; a
    // cancelled one reports that instead of ever calling `tools::call` with
    // `dry_run: false`.
    let content = if pending.is_write {
        match pending.resolved {
            Some(true) => tools::call(conn, &pending.tool_call.name, &pending.tool_call.arguments, false)
                .unwrap_or_else(|e| serde_json::json!({ "error": e })),
            _ => serde_json::json!({ "cancelled": true, "note": "the user declined this action" }),
        }
    } else {
        pending.preview.clone()
    };
    ToolResult { tool_call_id: pending.tool_call.id.clone(), name: pending.tool_call.name.clone(), content }
}

/// Drives the loop from the conversation's current messages until it either
/// finishes a turn (text/structured/error) or pauses on a write batch.
/// Persists the conversation before returning either way.
pub fn advance(
    app: &tauri::AppHandle,
    conn: &Connection,
    ai_state: &AiState,
    conversation: &mut Conversation,
    sink: &mut dyn StreamSink,
) -> AppResult<()> {
    let provider = ai_state.build_provider(app, &conversation.provider_id)?;
    loop {
        let request = CompletionRequest {
            model: conversation.model.clone(),
            messages: build_request_messages(ai_state, conversation),
            tools: tools::tool_specs(),
            structured_output: None,
        };
        let mut collector = Collector { events: Vec::new(), sink };
        provider.complete(request, &mut collector)?;

        let text: String = collector
            .events
            .iter()
            .filter_map(|e| match e {
                StreamEvent::TextDelta { text } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        let reasoning: String = collector
            .events
            .iter()
            .filter_map(|e| match e {
                StreamEvent::ReasoningDelta { text } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        let reasoning = (!reasoning.is_empty()).then_some(reasoning);
        let calls = collector.events.iter().find_map(|e| match e {
            StreamEvent::ToolCalls { calls } => Some(calls.clone()),
            _ => None,
        });
        let error_message = collector.events.iter().find_map(|e| match e {
            StreamEvent::Error { message } => Some(message.clone()),
            _ => None,
        });

        if let Some(message) = error_message {
            // Persisted, not just streamed live — otherwise a failed request
            // (a bad model name, an expired key, a rate limit) leaves the
            // conversation looking like the assistant simply never answered,
            // with nothing to show if the live stream event was missed or
            // the conversation is reopened later (PLAN §8.7: "a plain, calm
            // message with a retry option", never a silent no-op).
            conversation
                .messages
                .push(Message::assistant_text_with_reasoning(format!("I couldn't answer: {message}"), None));
            conversation.updated_at = crate::db::now();
            ai_state.save_conversation(conversation.clone())?;
            return Ok(());
        }

        let Some(calls) = calls else {
            // A plain text turn: done.
            if !text.is_empty() || reasoning.is_some() {
                conversation.messages.push(Message::assistant_text_with_reasoning(text, reasoning));
            }
            conversation.updated_at = crate::db::now();
            ai_state.save_conversation(conversation.clone())?;
            return Ok(());
        };

        if !text.is_empty() || reasoning.is_some() {
            conversation.messages.push(Message::assistant_text_with_reasoning(text, reasoning));
        }
        conversation.messages.push(Message::assistant_tool_calls(calls.clone()));

        let pending: Vec<PendingToolCall> = calls.iter().map(|c| resolve_one(conn, c)).collect();
        let has_write_awaiting = pending.iter().any(|p| p.is_write);

        if !has_write_awaiting {
            // Every call in this batch was a read — resolve immediately and
            // keep going, no pause (PLAN §4.3).
            let results: Vec<ToolResult> = pending.iter().map(|p| pending_to_tool_result(conn, p)).collect();
            conversation.messages.push(Message::tool_results(results));
            continue;
        }

        conversation.pending = pending;
        conversation.updated_at = crate::db::now();
        ai_state.save_conversation(conversation.clone())?;
        return Ok(());
    }
}

pub fn send_message(
    app: &tauri::AppHandle,
    conn: &Connection,
    ai_state: &AiState,
    conversation: &mut Conversation,
    user_text: String,
    sink: &mut dyn StreamSink,
) -> AppResult<()> {
    if !conversation.pending.is_empty() {
        return Err(AppError::InvalidInput(
            "this conversation has an unresolved action awaiting confirmation".into(),
        ));
    }
    conversation.messages.push(Message::user(user_text));
    advance(app, conn, ai_state, conversation, sink)
}

/// Applies the user's confirm/cancel decision for each pending write (a read
/// in the same batch is already resolved and ignores `decisions`), then
/// resumes the loop.
pub fn resolve_pending(
    app: &tauri::AppHandle,
    conn: &Connection,
    ai_state: &AiState,
    conversation: &mut Conversation,
    decisions: &std::collections::HashMap<String, bool>,
    sink: &mut dyn StreamSink,
) -> AppResult<()> {
    if conversation.pending.is_empty() {
        return Err(AppError::InvalidInput("nothing is awaiting confirmation".into()));
    }
    for pending in &mut conversation.pending {
        if pending.is_write && pending.resolved.is_none() {
            if let Some(&confirmed) = decisions.get(&pending.tool_call.id) {
                pending.resolved = Some(confirmed);
            }
        }
    }
    if conversation.pending.iter().any(|p| p.is_write && p.resolved.is_none()) {
        // Still waiting on some of the batch; save the partial decisions and
        // stop here rather than guessing the rest.
        ai_state.save_conversation(conversation.clone())?;
        return Ok(());
    }
    let results: Vec<ToolResult> = conversation.pending.iter().map(|p| pending_to_tool_result(conn, p)).collect();
    conversation.messages.push(Message::tool_results(results));
    conversation.pending.clear();
    advance(app, conn, ai_state, conversation, sink)
}

/// A one-shot structured-generation call (PLAN §4.2), used by the study
/// features (quiz questions, flashcards, plan-my-week proposals) instead of
/// the full tool-calling loop. The caller validates the result against
/// `describe_json` before ever showing a preview.
pub fn run_structured(
    app: &tauri::AppHandle,
    ai_state: &AiState,
    provider_id: &str,
    model: &str,
    prompt: &str,
    output: StructuredOutputSpec,
) -> AppResult<Value> {
    let provider = ai_state.build_provider(app, provider_id)?;
    if !provider.capabilities().structured_output {
        return Err(AppError::InvalidInput(
            "the active provider doesn't support structured generation".into(),
        ));
    }
    let request = CompletionRequest {
        model: model.to_string(),
        messages: vec![Message::system(system_prompt(ai_state)), Message::user(prompt.to_string())],
        tools: Vec::new(),
        structured_output: Some(output),
    };
    struct OneShot(Option<Value>, Option<String>);
    impl StreamSink for OneShot {
        fn send(&mut self, event: StreamEvent) {
            match event {
                StreamEvent::Structured { value } => self.0 = Some(value),
                StreamEvent::Error { message } => self.1 = Some(message),
                _ => {}
            }
        }
    }
    let mut sink = OneShot(None, None);
    provider.complete(request, &mut sink)?;
    if let Some(message) = sink.1 {
        return Err(AppError::Remote(message));
    }
    sink.0.ok_or_else(|| AppError::Remote("the provider returned no structured result".into()))
}
