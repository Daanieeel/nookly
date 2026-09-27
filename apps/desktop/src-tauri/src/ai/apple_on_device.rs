//! On-device Apple Intelligence (PLAN §3.6), over
//! `tauri-plugin-apple-intelligence` (`entro314-labs/tauri-plugin-apple-intelligence`
//! on crates.io/GitHub — confirmed real, actively maintained, MIT). Apple
//! Silicon macOS only; the crate ships its own prebuilt `libappleai.dylib`
//! bridging Apple's FoundationModels framework, linked via its own `build.rs`.
//!
//! Pinned to `=0.12.0` in `Cargo.toml`: 0.12.2 bumped its MSRV to rustc
//! 1.98.1, one patch past the toolchain this was built and tested against
//! (rustc 1.98.0). Bump the pin once that toolchain is available.
//!
//! Every call goes through `AppleIntelligenceExt` on the app handle, so this
//! is real, not a stub — but `check_availability()` (device eligible, Apple
//! Intelligence actually enabled, model downloaded) is a genuine runtime
//! check, never assumed true just because the OS/arch match.

use super::provider::{
    AiProvider, CompletionRequest, Message, ModelInfo, ProviderCapabilities, Role, StreamEvent,
    StreamSink, ToolCall,
};
use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Listener};
use tauri_plugin_apple_intelligence::{
    AppleAIGenerateRequest, AppleAIMessage, AppleAIStreamEvent, AppleAIToolCall,
    AppleAIToolCallFunction, AppleAIToolDefinition, AppleIntelligenceExt,
};

pub struct AppleOnDeviceProvider {
    pub app: AppHandle,
}

/// Real device/OS/enablement check — never assumed from the OS and chip
/// alone. `reason` explains why when unavailable, straight from the
/// framework (PLAN §2: the Assistant page must say what's actually missing).
pub fn availability_status(app: &AppHandle) -> (bool, Option<String>) {
    match app.apple_intelligence().check_availability() {
        Ok(status) => (status.available, (!status.available).then_some(status.reason)),
        Err(e) => (false, Some(e.to_string())),
    }
}

fn empty_message(role: &str) -> AppleAIMessage {
    AppleAIMessage {
        role: role.to_string(),
        content: None,
        name: None,
        tool_call_id: None,
        tool_calls: None,
        images: None,
    }
}

fn to_apple_messages(messages: &[Message]) -> Vec<AppleAIMessage> {
    messages
        .iter()
        .flat_map(|m| -> Vec<AppleAIMessage> {
            match m.role {
                Role::System => vec![AppleAIMessage { content: m.text.clone(), ..empty_message("system") }],
                Role::User => vec![AppleAIMessage { content: m.text.clone(), ..empty_message("user") }],
                Role::Assistant => {
                    let tool_calls = (!m.tool_calls.is_empty()).then(|| {
                        m.tool_calls
                            .iter()
                            .map(|c| AppleAIToolCall {
                                id: c.id.clone(),
                                call_type: "function".into(),
                                function: AppleAIToolCallFunction {
                                    name: c.name.clone(),
                                    arguments: c.arguments.to_string(),
                                },
                            })
                            .collect()
                    });
                    vec![AppleAIMessage {
                        content: m.text.clone(),
                        tool_calls,
                        ..empty_message("assistant")
                    }]
                }
                Role::Tool => m
                    .tool_results
                    .iter()
                    .map(|r| AppleAIMessage {
                        content: Some(r.content.to_string()),
                        tool_call_id: Some(r.tool_call_id.clone()),
                        name: Some(r.name.clone()),
                        ..empty_message("tool")
                    })
                    .collect(),
            }
        })
        .collect()
}

fn to_apple_tools(tools: &[super::provider::ToolSpec]) -> Vec<AppleAIToolDefinition> {
    tools
        .iter()
        .map(|t| AppleAIToolDefinition {
            name: t.name.clone(),
            description: Some(t.description.clone()),
            parameters: t.parameters.clone(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use tauri_plugin_apple_intelligence::AppleIntelligenceExt;

    /// A real probe against the actual FoundationModels framework on
    /// whatever machine runs this test — not mocked, only the surrounding
    /// Tauri app is (`check_availability`/`generate`/`stream` call straight
    /// into the native dylib regardless of runtime). `#[ignore]`d like the
    /// plugin's own live-hardware tests, since CI has no Apple Intelligence
    /// device; run explicitly with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn real_device_availability_probe() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_apple_intelligence::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("mock app builds");
        let availability = app.apple_intelligence().check_availability().expect("native call succeeds");
        eprintln!("Apple Intelligence availability on this machine: {availability:?}");
    }

    /// Exercises real non-streaming generation directly through the plugin's
    /// own extension trait (bypassing `AppleOnDeviceProvider`, which is typed
    /// to the real `Wry` runtime and can't hold a `MockRuntime` handle) —
    /// confirms actual inference works on this machine, not just that
    /// `check_availability` reports `true`.
    #[test]
    #[ignore]
    fn real_device_generate_probe() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_apple_intelligence::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("mock app builds");
        let request = tauri_plugin_apple_intelligence::AppleAIGenerateRequest {
            messages: vec![tauri_plugin_apple_intelligence::AppleAIMessage {
                role: "user".into(),
                content: Some("Say hello in exactly three words.".into()),
                name: None,
                tool_call_id: None,
                tool_calls: None,
                images: None,
            }],
            tools: None,
            schema: None,
            model: Some("on-device".into()),
            reasoning_level: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
            top_k: None,
            seed: None,
            tool_choice: None,
            stop_after_tool_calls: None,
        };
        let result = app.apple_intelligence().generate(request).expect("generation succeeds");
        eprintln!("Apple Intelligence said: {:?}", result.text);
        assert!(!result.text.trim().is_empty(), "expected non-empty generated text");
    }
}

impl AiProvider for AppleOnDeviceProvider {
    fn capabilities(&self) -> ProviderCapabilities {
        let context_tokens = self
            .app
            .apple_intelligence()
            .context_info(None)
            .ok()
            .map(|info| info.context_size)
            .filter(|&n| n > 0)
            // Apple's own documented default when it can't be read: 4096 on
            // macOS 26, 8192 on macOS 27 — 4096 is the conservative floor.
            .unwrap_or(4096) as u32;
        ProviderCapabilities { streaming: true, tool_calling: true, structured_output: true, context_tokens }
    }

    fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        // One fixed on-device model — no vendor model-list endpoint to call.
        // Private Cloud Compute exists in the underlying plugin but needs an
        // entitlement Apple grants only to apps it has approved (PLAN §12: no
        // Nookly-hosted AI, nothing this app can obtain on its own), so it's
        // never offered here.
        Ok(vec![ModelInfo { id: "on-device".into(), label: "Apple Intelligence (on-device)".into() }])
    }

    fn complete(&self, request: CompletionRequest, sink: &mut dyn StreamSink) -> AppResult<()> {
        let is_structured = request.structured_output.is_some();
        let apple_request = AppleAIGenerateRequest {
            messages: to_apple_messages(&request.messages),
            tools: (!request.tools.is_empty()).then(|| to_apple_tools(&request.tools)),
            schema: request.structured_output.map(|s| s.schema),
            model: Some("on-device".into()),
            reasoning_level: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
            top_k: None,
            seed: None,
            tool_choice: None,
            stop_after_tool_calls: None,
        };

        let start = self
            .app
            .apple_intelligence()
            .stream(apple_request)
            .map_err(|e| AppError::Remote(format!("Apple Intelligence: {e}")))?;

        // `stream()` emits events on the app handle by name (not the invoke
        // Channel the webview transport uses) — bridge them onto a channel so
        // this synchronous `complete` can block on them like every other
        // provider's blocking HTTP read.
        let (tx, rx) = std::sync::mpsc::channel::<AppleAIStreamEvent>();
        let listener_id = self.app.listen(start.event_name.clone(), move |event| {
            if let Ok(parsed) = serde_json::from_str::<AppleAIStreamEvent>(event.payload()) {
                let _ = tx.send(parsed);
            }
        });

        let mut tool_calls: Vec<ToolCall> = Vec::new();
        let mut text_buffer = String::new();
        let outcome = loop {
            match rx.recv() {
                Ok(AppleAIStreamEvent::Text { text }) => {
                    if is_structured {
                        text_buffer.push_str(&text);
                    } else {
                        sink.send(StreamEvent::TextDelta { text });
                    }
                }
                Ok(AppleAIStreamEvent::Reasoning { text }) => {
                    sink.send(StreamEvent::ReasoningDelta { text });
                }
                Ok(AppleAIStreamEvent::ToolCall { tool_call_id, tool_name, args }) => {
                    tool_calls.push(ToolCall { id: tool_call_id, name: tool_name, arguments: args });
                }
                Ok(AppleAIStreamEvent::Usage { .. }) => {}
                Ok(AppleAIStreamEvent::Warning { .. }) => {}
                Ok(AppleAIStreamEvent::Done) => break Ok(()),
                Ok(AppleAIStreamEvent::Error { message, code, .. }) => break Err(format!("[{code}] {message}")),
                Err(_) => break Err("the on-device model's stream ended unexpectedly".to_string()),
            }
        };
        self.app.unlisten(listener_id);

        match outcome {
            Err(message) => sink.send(StreamEvent::Error { message }),
            Ok(()) if !tool_calls.is_empty() => sink.send(StreamEvent::ToolCalls { calls: tool_calls }),
            Ok(()) if is_structured => {
                let value = serde_json::from_str(&text_buffer).unwrap_or(serde_json::Value::Null);
                sink.send(StreamEvent::Structured { value });
            }
            Ok(()) => sink.send(StreamEvent::Done),
        }
        Ok(())
    }
}
