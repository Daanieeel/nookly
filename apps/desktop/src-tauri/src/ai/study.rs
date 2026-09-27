//! Study features (PLAN §7.1) built on `agent_loop::run_structured` rather
//! than a new registry: any block-supporting entity (a Note, Jot, Task or
//! Sub-task — `describe <type>` reports `supportsBlocks`) can be quizzed on,
//! since its content is already reachable through `db::notes::render_page_markdown`,
//! the same renderer the CLI's export uses.

use super::agent_loop::run_structured;
use super::provider::StructuredOutputSpec;
use super::AiState;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizQuestion {
    pub question: String,
    pub answer: String,
}

/// Generates `count` question/answer pairs testing recall of `entity_id`'s
/// own content. Runs once, no tool calls, no confirmation needed — nothing it
/// produces is saved until the quiz UI's own "Turn misses into flashcards"
/// action (a normal, previewed `create` tool call) runs.
pub fn generate_quiz(
    app: &tauri::AppHandle,
    conn: &Connection,
    ai_state: &AiState,
    entity_id: &str,
    count: u32,
) -> AppResult<Vec<QuizQuestion>> {
    let markdown = crate::db::notes::render_page_markdown(conn, entity_id)?;
    let trimmed = markdown.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("this page has no content to quiz on yet".into()));
    }
    let provider_id = ai_state
        .default_provider_id()
        .ok_or_else(|| AppError::InvalidInput("no AI provider is configured yet".into()))?;
    let provider_config = ai_state.provider_config(&provider_id)?;
    let count = count.clamp(1, 20);

    let prompt = format!(
        "Write {count} quiz questions with answers, testing recall of specific facts in this \
         material (not vague generalities). Base every question only on what's actually here:\n\n{}",
        &trimmed[..trimmed.len().min(6000)]
    );
    let schema = json!({
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": { "question": { "type": "string" }, "answer": { "type": "string" } },
                    "required": ["question", "answer"],
                    "additionalProperties": false,
                },
            },
        },
        "required": ["questions"],
        "additionalProperties": false,
    });

    let result = run_structured(
        app,
        ai_state,
        &provider_id,
        provider_config.default_model.as_deref().unwrap_or_default(),
        &prompt,
        StructuredOutputSpec { name: "quiz".into(), schema },
    )?;
    let questions = result
        .get("questions")
        .cloned()
        .ok_or_else(|| AppError::Remote("the provider returned no questions".into()))?;
    serde_json::from_value(questions)
        .map_err(|e| AppError::Remote(format!("the provider's quiz result didn't match the expected shape: {e}")))
}
