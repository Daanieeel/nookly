//! Any OpenAI-compatible endpoint: a custom base URL speaking the same Chat
//! Completions wire format. Covers local servers (Ollama, LM Studio — fully
//! offline, and the best option for AI on Windows/Linux without the cloud)
//! and hosted services that speak the same API (PLAN §3.2).

use super::openai::stream_chat_completion;
use super::provider::{AiProvider, CompletionRequest, ModelInfo, ProviderCapabilities, StreamSink};
use crate::error::{AppError, AppResult};
use serde_json::Value;

pub struct OpenAiCompatibleProvider {
    pub base_url: String,
    /// Local servers like Ollama/LM Studio don't require one.
    pub api_key: Option<String>,
    /// A local model's window is far smaller than a hosted frontier model's
    /// (PLAN §3.1's "small on-device model keeps the lean path" applies here
    /// too, since a self-hosted model is usually the small end of the range).
    pub context_tokens: u32,
}

impl OpenAiCompatibleProvider {
    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }

    fn auth(&self, builder: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
        match &self.api_key {
            Some(key) if !key.is_empty() => builder.bearer_auth(key),
            _ => builder,
        }
    }
}

impl AiProvider for OpenAiCompatibleProvider {
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming: true,
            // Not every local server implements tool calling; the settings
            // "test connection" step should probe this, but we advertise it
            // optimistically since most modern Ollama/LM Studio builds do.
            tool_calling: true,
            structured_output: false,
            context_tokens: self.context_tokens,
        }
    }

    fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .auth(self.client().get(format!("{}/models", self.base_url.trim_end_matches('/'))))
            .send()
            .map_err(|e| AppError::Remote(format!("Provider at {}: {e}", self.base_url)))?;
        if !resp.status().is_success() {
            return Err(AppError::Remote(format!("Provider at {}: HTTP {}", self.base_url, resp.status())));
        }
        let body: Value = resp.json().map_err(|e| AppError::Remote(format!("{}: {e}", self.base_url)))?;
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
        let body = super::openai::build_body(&request.model, &request, true);
        stream_chat_completion(
            &self.client(),
            &format!("{}/chat/completions", self.base_url.trim_end_matches('/')),
            |b| self.auth(b),
            &body,
            sink,
            &format!("Provider at {}", self.base_url),
        )
    }
}
