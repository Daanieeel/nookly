//! The `AiProvider` trait every backend (Anthropic, OpenAI, Gemini, an
//! OpenAI-compatible endpoint, or Apple's on-device model) implements. Tools,
//! prompts, the profile block and the frontend renderer never know which
//! provider is active — swapping one out never requires feature code changes
//! (PLAN §3.1).

use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    pub streaming: bool,
    pub tool_calling: bool,
    pub structured_output: bool,
    /// Rough context budget in tokens, used to size how much of a note or how
    /// many search results go into a request (PLAN §3.1).
    pub context_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    /// The result of a tool call, fed back to the model.
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub tool_call_id: String,
    pub name: String,
    pub content: serde_json::Value,
}

/// One turn in the conversation sent to the provider. A turn carries either
/// plain text, one or more tool calls the assistant made, or a tool result
/// being fed back — never a mix, which keeps every provider's translation
/// simple.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub role: Role,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// A provider's reasoning/thinking trace for this turn, when it sent one
    /// (on-device Apple Intelligence today). Display only — never replayed
    /// back to a provider as conversation history.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_results: Vec<ToolResult>,
}

impl Message {
    pub fn system(text: impl Into<String>) -> Self {
        Self { role: Role::System, text: Some(text.into()), reasoning: None, tool_calls: Vec::new(), tool_results: Vec::new() }
    }

    pub fn user(text: impl Into<String>) -> Self {
        Self { role: Role::User, text: Some(text.into()), reasoning: None, tool_calls: Vec::new(), tool_results: Vec::new() }
    }

    /// The assistant's text for this turn, plus the reasoning trace that
    /// preceded it, when the provider sent one.
    pub fn assistant_text_with_reasoning(text: impl Into<String>, reasoning: Option<String>) -> Self {
        Self { role: Role::Assistant, text: Some(text.into()), reasoning, tool_calls: Vec::new(), tool_results: Vec::new() }
    }

    pub fn assistant_tool_calls(calls: Vec<ToolCall>) -> Self {
        Self { role: Role::Assistant, text: None, reasoning: None, tool_calls: calls, tool_results: Vec::new() }
    }

    pub fn tool_results(results: Vec<ToolResult>) -> Self {
        Self { role: Role::Tool, text: None, reasoning: None, tool_calls: Vec::new(), tool_results: results }
    }
}

/// One callable tool the model may invoke, described the same way
/// `describe_json` describes an entity type: name, prose description, and a
/// JSON Schema for its arguments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOutputSpec {
    pub name: String,
    pub schema: serde_json::Value,
}

pub struct CompletionRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub tools: Vec<ToolSpec>,
    /// Set only for a structured-generation call (PLAN §4.2); providers
    /// without `structured_output` ignore it and return prose instead.
    pub structured_output: Option<StructuredOutputSpec>,
}

/// One piece of a streamed response. A provider emits any number of `Text`
/// events, then either finishes (`Done`) or asks for tools (`ToolCalls`) —
/// the agent loop (`agent_loop.rs`) resolves those and calls `complete` again
/// with the results appended.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StreamEvent {
    TextDelta { text: String },
    /// A provider's reasoning/thinking trace, when it has one (on-device
    /// Apple Intelligence's `reasoningLevel`; cloud providers don't wire this
    /// yet). Kept separate from `TextDelta` so the renderer can show it as a
    /// quiet, collapsible aside instead of mixing it into the answer.
    ReasoningDelta { text: String },
    ToolCalls { calls: Vec<ToolCall> },
    /// A structured-generation result, already parsed as JSON.
    Structured { value: serde_json::Value },
    Done,
    Error { message: String },
}

/// Where a provider sends `StreamEvent`s as they arrive. The Tauri command
/// layer implements this over `AppHandle::emit` (`office_install.rs`'s
/// `PROGRESS_EVENT` pattern is the closest existing precedent); tests can
/// implement it over a `Vec`.
pub trait StreamSink: Send {
    fn send(&mut self, event: StreamEvent);
}

pub trait AiProvider: Send + Sync {
    fn capabilities(&self) -> ProviderCapabilities;

    /// Fetches the vendor's current model list. Model ids are never
    /// hardcoded (PLAN §3.2) — this is what backs the settings picker.
    fn list_models(&self) -> AppResult<Vec<ModelInfo>>;

    /// Runs one completion, streaming every event to `sink` as it arrives.
    /// Returns once the stream ends (`Done` or `Error` was already sent).
    fn complete(&self, request: CompletionRequest, sink: &mut dyn StreamSink) -> AppResult<()>;
}
