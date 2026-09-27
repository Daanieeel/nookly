//! OpenAI Chat Completions API (`api.openai.com/v1/chat/completions`). Also
//! the wire format any "OpenAI-compatible endpoint" speaks (`openai_compatible.rs`
//! reuses the request/response builders here with a different base URL and an
//! optional key), which is what lets a local Ollama or LM Studio server work
//! through the exact same code path (PLAN §3.2).

use super::provider::{
    AiProvider, CompletionRequest, ModelInfo, ProviderCapabilities, Role, StreamEvent, StreamSink,
    ToolCall,
};
use super::sse::read_event_stream;
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use std::collections::HashMap;

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

pub struct OpenAiProvider {
    pub api_key: String,
    pub base_url: String,
    /// Large hosted models vs. a small local one get a different context
    /// budget (PLAN §3.1); `openai_compatible.rs` overrides this down.
    pub context_tokens: u32,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key, base_url: DEFAULT_BASE_URL.to_string(), context_tokens: 128_000 }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }

    fn auth(&self, builder: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
        if self.api_key.is_empty() {
            builder
        } else {
            builder.bearer_auth(&self.api_key)
        }
    }
}

pub fn build_body(model: &str, req: &CompletionRequest, stream: bool) -> Value {
    let messages: Vec<Value> = req
        .messages
        .iter()
        .flat_map(|m| -> Vec<Value> {
            match m.role {
                Role::System => vec![json!({ "role": "system", "content": m.text.clone().unwrap_or_default() })],
                Role::User => vec![json!({ "role": "user", "content": m.text.clone().unwrap_or_default() })],
                Role::Assistant => {
                    let mut msg = json!({ "role": "assistant" });
                    if let Some(text) = &m.text {
                        msg["content"] = json!(text);
                    } else {
                        msg["content"] = Value::Null;
                    }
                    if !m.tool_calls.is_empty() {
                        msg["tool_calls"] = json!(m
                            .tool_calls
                            .iter()
                            .map(|c| json!({
                                "id": c.id,
                                "type": "function",
                                "function": { "name": c.name, "arguments": c.arguments.to_string() },
                            }))
                            .collect::<Vec<_>>());
                    }
                    vec![msg]
                }
                Role::Tool => m
                    .tool_results
                    .iter()
                    .map(|r| json!({ "role": "tool", "tool_call_id": r.tool_call_id, "content": r.content.to_string() }))
                    .collect(),
            }
        })
        .collect();

    let mut body = json!({ "model": model, "messages": messages, "stream": stream });
    if !req.tools.is_empty() {
        body["tools"] = json!(req
            .tools
            .iter()
            .map(|t| json!({
                "type": "function",
                "function": { "name": t.name, "description": t.description, "parameters": t.parameters },
            }))
            .collect::<Vec<_>>());
    }
    if let Some(structured) = &req.structured_output {
        body["response_format"] = json!({
            "type": "json_schema",
            "json_schema": { "name": structured.name, "schema": structured.schema, "strict": true },
        });
    }
    body
}

/// Accumulates OpenAI's index-keyed streaming tool-call deltas
/// (`choices[0].delta.tool_calls[].index`) into complete calls once the
/// stream ends.
#[derive(Default)]
struct ToolCallAccum {
    order: Vec<u64>,
    by_index: HashMap<u64, (String, String, String)>, // id, name, arguments buffer
}

impl ToolCallAccum {
    fn apply(&mut self, delta: &Value) {
        let Some(index) = delta["index"].as_u64() else { return };
        if !self.by_index.contains_key(&index) {
            self.order.push(index);
            self.by_index.insert(index, (String::new(), String::new(), String::new()));
        }
        let entry = self.by_index.get_mut(&index).expect("just inserted");
        if let Some(id) = delta["id"].as_str() {
            entry.0 = id.to_string();
        }
        if let Some(name) = delta["function"]["name"].as_str() {
            entry.1.push_str(name);
        }
        if let Some(args) = delta["function"]["arguments"].as_str() {
            entry.2.push_str(args);
        }
    }

    fn into_calls(self) -> Vec<ToolCall> {
        self.order
            .into_iter()
            .filter_map(|i| self.by_index.get(&i).cloned())
            .map(|(id, name, args)| ToolCall {
                id,
                name,
                arguments: serde_json::from_str(&args).unwrap_or(Value::Object(Default::default())),
            })
            .collect()
    }
}

pub fn stream_chat_completion(
    client: &reqwest::blocking::Client,
    url: &str,
    auth: impl FnOnce(reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder,
    body: &Value,
    sink: &mut dyn StreamSink,
    label: &str,
) -> AppResult<()> {
    let resp = auth(client.post(url).header("content-type", "application/json").json(body))
        .send()
        .map_err(|e| AppError::Remote(format!("{label}: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        sink.send(StreamEvent::Error { message: format!("{label}: HTTP {status}: {text}") });
        return Ok(());
    }

    let mut accum = ToolCallAccum::default();
    let mut structured_buf = String::new();
    let mut saw_tool_calls = false;

    read_event_stream(resp, |data| {
        let Ok(event): Result<Value, _> = serde_json::from_str(data) else { return true };
        let Some(choice) = event["choices"].get(0) else { return true };
        if let Some(text) = choice["delta"]["content"].as_str() {
            structured_buf.push_str(text);
            sink.send(StreamEvent::TextDelta { text: text.to_string() });
        }
        if let Some(calls) = choice["delta"]["tool_calls"].as_array() {
            saw_tool_calls = true;
            for call in calls {
                accum.apply(call);
            }
        }
        true
    });

    if saw_tool_calls {
        sink.send(StreamEvent::ToolCalls { calls: accum.into_calls() });
    } else if !structured_buf.is_empty() {
        // Only meaningful when the caller asked for structured output; plain
        // chat replies also flow through here and just show as text above.
        if let Ok(value) = serde_json::from_str::<Value>(&structured_buf) {
            sink.send(StreamEvent::Structured { value });
        } else {
            sink.send(StreamEvent::Done);
        }
    } else {
        sink.send(StreamEvent::Done);
    }
    Ok(())
}

impl AiProvider for OpenAiProvider {
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming: true,
            tool_calling: true,
            structured_output: true,
            context_tokens: self.context_tokens,
        }
    }

    fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .auth(self.client().get(format!("{}/models", self.base_url)))
            .send()
            .map_err(|e| AppError::Remote(format!("OpenAI: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Remote(format!("OpenAI: HTTP {}", resp.status())));
        }
        let body: Value = resp.json().map_err(|e| AppError::Remote(format!("OpenAI: {e}")))?;
        Ok(body["data"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|m| {
                let id = m["id"].as_str()?.to_string();
                Some(ModelInfo { label: id.clone(), id })
            })
            .collect())
    }

    fn complete(&self, request: CompletionRequest, sink: &mut dyn StreamSink) -> AppResult<()> {
        let body = build_body(&request.model, &request, true);
        stream_chat_completion(
            &self.client(),
            &format!("{}/chat/completions", self.base_url),
            |b| self.auth(b),
            &body,
            sink,
            "OpenAI",
        )
    }
}
