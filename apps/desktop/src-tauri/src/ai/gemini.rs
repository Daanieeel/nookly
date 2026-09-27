//! Google Gemini's `generateContent`/`streamGenerateContent` API.

use super::provider::{
    AiProvider, CompletionRequest, ModelInfo, ProviderCapabilities, Role, StreamEvent, StreamSink,
    ToolCall,
};
use super::sse::read_event_stream;
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};

const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

pub struct GeminiProvider {
    pub api_key: String,
    pub base_url: String,
}

impl GeminiProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key, base_url: DEFAULT_BASE_URL.to_string() }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }
}

/// Gemini's function-calling and structured-output schemas are a restricted
/// OpenAPI 3.0 subset, not full JSON Schema — `additionalProperties` (which
/// our own tool specs and structured-output requests set to pin a JSON
/// Schema down) isn't a recognized field there, and Gemini's API rejects the
/// whole request with `INVALID_ARGUMENT` if it's present anywhere in the
/// schema tree. Strip it recursively before sending.
fn strip_unsupported_schema_keywords(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(key, _)| *key != "additionalProperties")
                .map(|(key, val)| (key.clone(), strip_unsupported_schema_keywords(val)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(strip_unsupported_schema_keywords).collect()),
        other => other.clone(),
    }
}

fn build_body(req: &CompletionRequest) -> Value {
    let system_text: String = req
        .messages
        .iter()
        .filter(|m| m.role == Role::System)
        .filter_map(|m| m.text.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut contents = Vec::new();
    for m in req.messages.iter().filter(|m| m.role != Role::System) {
        match m.role {
            Role::User => {
                if let Some(text) = &m.text {
                    contents.push(json!({ "role": "user", "parts": [{ "text": text }] }));
                }
            }
            Role::Assistant => {
                let mut parts = Vec::new();
                if let Some(text) = &m.text {
                    parts.push(json!({ "text": text }));
                }
                for call in &m.tool_calls {
                    parts.push(json!({ "functionCall": { "name": call.name, "args": call.arguments } }));
                }
                contents.push(json!({ "role": "model", "parts": parts }));
            }
            Role::Tool => {
                let parts: Vec<Value> = m
                    .tool_results
                    .iter()
                    .map(|r| json!({ "functionResponse": { "name": r.name, "response": { "result": r.content } } }))
                    .collect();
                contents.push(json!({ "role": "user", "parts": parts }));
            }
            Role::System => unreachable!(),
        }
    }

    let mut body = json!({ "contents": contents });
    if !system_text.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system_text }] });
    }
    if !req.tools.is_empty() {
        body["tools"] = json!([{
            "functionDeclarations": req.tools.iter().map(|t| json!({
                "name": t.name, "description": t.description,
                "parameters": strip_unsupported_schema_keywords(&t.parameters),
            })).collect::<Vec<_>>(),
        }]);
    }
    if let Some(structured) = &req.structured_output {
        body["generationConfig"] = json!({
            "responseMimeType": "application/json",
            "responseSchema": strip_unsupported_schema_keywords(&structured.schema),
        });
    }
    body
}

impl AiProvider for GeminiProvider {
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming: true,
            tool_calling: true,
            structured_output: true,
            context_tokens: 1_000_000,
        }
    }

    fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .client()
            .get(format!("{}/models", self.base_url))
            .query(&[("key", &self.api_key)])
            .send()
            .map_err(|e| AppError::Remote(format!("Gemini: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Remote(format!("Gemini: HTTP {}", resp.status())));
        }
        let body: Value = resp.json().map_err(|e| AppError::Remote(format!("Gemini: {e}")))?;
        Ok(body["models"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|m| {
                let name = m["name"].as_str()?.to_string();
                let id = name.strip_prefix("models/").unwrap_or(&name).to_string();
                let label = m["displayName"].as_str().unwrap_or(&id).to_string();
                Some(ModelInfo { id, label })
            })
            .collect())
    }

    fn complete(&self, request: CompletionRequest, sink: &mut dyn StreamSink) -> AppResult<()> {
        let body = build_body(&request);
        let url = format!(
            "{}/models/{}:streamGenerateContent",
            self.base_url, request.model
        );
        let resp = self
            .client()
            .post(url)
            .query(&[("alt", "sse"), ("key", &self.api_key)])
            .json(&body)
            .send()
            .map_err(|e| AppError::Remote(format!("Gemini: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            sink.send(StreamEvent::Error { message: format!("Gemini: HTTP {status}: {text}") });
            return Ok(());
        }

        let mut calls: Vec<ToolCall> = Vec::new();
        let mut structured_buf = String::new();
        let structured = request.structured_output.is_some();

        read_event_stream(resp, |data| {
            let Ok(event): Result<Value, _> = serde_json::from_str(data) else { return true };
            let Some(candidate) = event["candidates"].get(0) else { return true };
            for part in candidate["content"]["parts"].as_array().cloned().unwrap_or_default() {
                if let Some(text) = part["text"].as_str() {
                    if structured {
                        structured_buf.push_str(text);
                    } else {
                        sink.send(StreamEvent::TextDelta { text: text.to_string() });
                    }
                }
                if let Some(call) = part.get("functionCall") {
                    calls.push(ToolCall {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: call["name"].as_str().unwrap_or_default().to_string(),
                        arguments: call["args"].clone(),
                    });
                }
            }
            true
        });

        if !calls.is_empty() {
            sink.send(StreamEvent::ToolCalls { calls });
        } else if structured {
            let value: Value = serde_json::from_str(&structured_buf).unwrap_or(Value::Null);
            sink.send(StreamEvent::Structured { value });
        } else {
            sink.send(StreamEvent::Done);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_additional_properties_at_every_depth() {
        let schema = json!({
            "type": "object",
            "properties": {
                "fields": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": { "title": { "type": "string" } },
                },
            },
            "additionalProperties": false,
        });
        let cleaned = strip_unsupported_schema_keywords(&schema);
        assert!(cleaned.get("additionalProperties").is_none());
        assert!(cleaned["properties"]["fields"].get("additionalProperties").is_none());
        // Everything else survives untouched.
        assert_eq!(cleaned["properties"]["fields"]["properties"]["title"]["type"], "string");
    }
}
