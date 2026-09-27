//! Anthropic Messages API (`api.anthropic.com/v1/messages`), one of the four
//! supported custom providers (PLAN §3.2).

use super::provider::{
    AiProvider, CompletionRequest, ModelInfo, ProviderCapabilities, Role, StreamEvent, StreamSink,
    ToolCall,
};
use super::sse::read_event_stream;
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const API_VERSION: &str = "2023-06-01";

pub struct AnthropicProvider {
    pub api_key: String,
    pub base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key, base_url: DEFAULT_BASE_URL.to_string() }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }
}

/// Anthropic has no messages of role `system`; the system prompt is its own
/// top level field, and tool results travel back as `user` turns carrying
/// `tool_result` content blocks.
fn build_body(req: &CompletionRequest, stream: bool) -> Value {
    let system: String = req
        .messages
        .iter()
        .filter(|m| m.role == Role::System)
        .filter_map(|m| m.text.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut messages = Vec::new();
    for m in req.messages.iter().filter(|m| m.role != Role::System) {
        match m.role {
            Role::User => {
                if let Some(text) = &m.text {
                    messages.push(json!({ "role": "user", "content": text }));
                }
            }
            Role::Assistant => {
                let mut content = Vec::new();
                if let Some(text) = &m.text {
                    content.push(json!({ "type": "text", "text": text }));
                }
                for call in &m.tool_calls {
                    content.push(json!({
                        "type": "tool_use",
                        "id": call.id,
                        "name": call.name,
                        "input": call.arguments,
                    }));
                }
                messages.push(json!({ "role": "assistant", "content": content }));
            }
            Role::Tool => {
                let content: Vec<Value> = m
                    .tool_results
                    .iter()
                    .map(|r| {
                        json!({
                            "type": "tool_result",
                            "tool_use_id": r.tool_call_id,
                            "content": r.content.to_string(),
                        })
                    })
                    .collect();
                messages.push(json!({ "role": "user", "content": content }));
            }
            Role::System => unreachable!(),
        }
    }

    let mut body = json!({
        "model": req.model,
        "max_tokens": 4096,
        "messages": messages,
        "stream": stream,
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    if !req.tools.is_empty() {
        body["tools"] = json!(req
            .tools
            .iter()
            .map(|t| json!({ "name": t.name, "description": t.description, "input_schema": t.parameters }))
            .collect::<Vec<_>>());
    }
    // Anthropic has no constrained-JSON mode; a structured-generation request
    // instead forces the single tool call whose schema is the desired shape,
    // then `agent_loop.rs` reads the tool call's arguments as the result.
    if let Some(structured) = &req.structured_output {
        body["tools"] = json!([{
            "name": structured.name,
            "description": "Produce the requested structured result.",
            "input_schema": structured.schema,
        }]);
        body["tool_choice"] = json!({ "type": "tool", "name": structured.name });
    }
    body
}

impl AiProvider for AnthropicProvider {
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming: true,
            tool_calling: true,
            structured_output: true,
            context_tokens: 180_000,
        }
    }

    fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .client()
            .get(format!("{}/v1/models", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .send()
            .map_err(|e| AppError::Remote(format!("Anthropic: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Remote(format!("Anthropic: HTTP {}", resp.status())));
        }
        let body: Value = resp.json().map_err(|e| AppError::Remote(format!("Anthropic: {e}")))?;
        Ok(body["data"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|m| {
                Some(ModelInfo {
                    id: m["id"].as_str()?.to_string(),
                    label: m["display_name"].as_str().unwrap_or(m["id"].as_str()?).to_string(),
                })
            })
            .collect())
    }

    fn complete(&self, request: CompletionRequest, sink: &mut dyn StreamSink) -> AppResult<()> {
        let body = build_body(&request, true);
        let resp = self
            .client()
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .map_err(|e| AppError::Remote(format!("Anthropic: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            sink.send(StreamEvent::Error { message: format!("Anthropic: HTTP {status}: {text}") });
            return Ok(());
        }

        let mut pending_calls: Vec<(String, String, String)> = Vec::new(); // (id, name, partial_json)
        let mut structured_call: Option<(String, String)> = None; // (name, partial_json), when forced
        let forced_tool = request.structured_output.as_ref().map(|s| s.name.clone());

        read_event_stream(resp, |data| {
            let Ok(event): Result<Value, _> = serde_json::from_str(data) else { return true };
            match event["type"].as_str().unwrap_or_default() {
                "content_block_start" => {
                    if event["content_block"]["type"].as_str() == Some("tool_use") {
                        let id = event["content_block"]["id"].as_str().unwrap_or_default().to_string();
                        let name = event["content_block"]["name"].as_str().unwrap_or_default().to_string();
                        if forced_tool.as_deref() == Some(name.as_str()) {
                            structured_call = Some((name, String::new()));
                        } else {
                            pending_calls.push((id, name, String::new()));
                        }
                    }
                }
                "content_block_delta" => match event["delta"]["type"].as_str() {
                    Some("text_delta") => {
                        if let Some(text) = event["delta"]["text"].as_str() {
                            sink.send(StreamEvent::TextDelta { text: text.to_string() });
                        }
                    }
                    Some("input_json_delta") => {
                        if let Some(partial) = event["delta"]["partial_json"].as_str() {
                            if let Some((_, buf)) = &mut structured_call {
                                buf.push_str(partial);
                            } else if let Some((_, _, buf)) = pending_calls.last_mut() {
                                buf.push_str(partial);
                            }
                        }
                    }
                    _ => {}
                },
                "message_stop" => return false,
                _ => {}
            }
            true
        });

        if let Some((name, buf)) = structured_call {
            let value: Value = serde_json::from_str(&buf).unwrap_or(Value::Null);
            let _ = name;
            sink.send(StreamEvent::Structured { value });
        } else if !pending_calls.is_empty() {
            let calls = pending_calls
                .into_iter()
                .map(|(id, name, buf)| ToolCall {
                    id,
                    name,
                    arguments: serde_json::from_str(&buf).unwrap_or(Value::Object(Default::default())),
                })
                .collect();
            sink.send(StreamEvent::ToolCalls { calls });
        } else {
            sink.send(StreamEvent::Done);
        }
        Ok(())
    }
}
