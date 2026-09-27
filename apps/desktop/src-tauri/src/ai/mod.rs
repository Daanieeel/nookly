//! The in-app AI assistant: provider abstraction (§3), the generic tool layer
//! (§4) and everything Settings → AI configures. Nothing here is an entity or
//! a migration — provider config lives in a JSON cache file next to
//! `nookly.db` (exactly like `external_calendars`), keys live only in the OS
//! keychain (`secrets.rs`), and conversations (§9) live in their own JSON file,
//! never in `nookly.db` and never synced.

pub mod agent_loop;
pub mod ambient;
pub mod anthropic;
pub mod apple_on_device;
pub mod gemini;
pub mod openai;
pub mod openai_compatible;
pub mod provider;
mod secrets;
mod sse;
pub mod study;
pub mod tools;

use crate::error::{AppError, AppResult};
use provider::AiProvider;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

const PROVIDERS_FILE: &str = "ai-providers.json";
const CONVERSATIONS_FILE: &str = "ai-conversations.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    AppleOnDevice,
    Anthropic,
    OpenAi,
    Gemini,
    OpenAiCompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub kind: ProviderKind,
    pub label: String,
    /// Only set for `OpenAiCompatible` (and ignored otherwise).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    /// Cloud providers only: the user explicitly acknowledged what gets sent
    /// (PLAN §3.4) when this provider was added.
    #[serde(default)]
    pub cloud_notice_acknowledged: bool,
}

impl AiProviderConfig {
    pub fn is_cloud(&self) -> bool {
        !matches!(self.kind, ProviderKind::AppleOnDevice)
    }

    /// Ambient features default to on-device or *local* providers only (PLAN
    /// §3.4). An OpenAI-compatible endpoint is the local case (Ollama, LM
    /// Studio) as often as it's a hosted one, so it's treated as eligible by
    /// default too; true cloud vendors need the feature's own opt-in.
    pub fn is_ambient_default_eligible(&self) -> bool {
        matches!(self.kind, ProviderKind::AppleOnDevice | ProviderKind::OpenAiCompatible)
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmbientSettings {
    #[serde(default)]
    pub auto_title_jots: bool,
    #[serde(default)]
    pub suggest_labels_relationships: bool,
    #[serde(default)]
    pub summarize_files_on_upload: bool,
    /// Ambient features default to on-device/local providers only (PLAN §3.4);
    /// each one needs a separate, explicit opt-in to use a cloud provider
    /// instead, tracked here by feature key.
    #[serde(default)]
    pub cloud_opt_in: Vec<String>,
}

/// One auto-title a background pass applied, kept so Settings → AI can offer
/// a one-click undo (PLAN §11) without a durable per-entity "AI generated"
/// flag, which would need a new field on every titled entity type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoTitleRecord {
    pub entity_id: String,
    pub entity_key: String,
    pub previous_title: String,
    pub new_title: String,
    pub applied_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreData {
    providers: Vec<AiProviderConfig>,
    default_provider_id: Option<String>,
    /// The condensed "About me" block (PLAN §5), included in every request.
    profile_block: Option<String>,
    ambient: AmbientSettings,
    #[serde(default)]
    auto_title_log: Vec<AutoTitleRecord>,
    /// File entity id -> generated summary (PLAN §11's "summarize files on
    /// upload"), kept here rather than a new column on `files` since it's
    /// AI-derived and optional, not core file data.
    #[serde(default)]
    file_summaries: std::collections::HashMap<String, String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ConversationStoreData {
    conversations: Vec<agent_loop::Conversation>,
}

pub struct AiState {
    providers_path: PathBuf,
    conversations_path: PathBuf,
    data: Mutex<StoreData>,
    conversations: Mutex<ConversationStoreData>,
}

fn load_json<T: Default + serde::de::DeserializeOwned>(path: &PathBuf) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_json<T: Serialize>(path: &PathBuf, data: &T) -> AppResult<()> {
    let json = serde_json::to_string_pretty(data).map_err(|e| AppError::Io(e.to_string()))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::rename(&tmp, path).map_err(|e| AppError::Io(e.to_string()))
}

impl AiState {
    pub fn load(app_data_dir: &std::path::Path) -> Self {
        let providers_path = app_data_dir.join(PROVIDERS_FILE);
        let conversations_path = app_data_dir.join(CONVERSATIONS_FILE);
        Self {
            data: Mutex::new(load_json(&providers_path)),
            conversations: Mutex::new(load_json(&conversations_path)),
            providers_path,
            conversations_path,
        }
    }

    fn save(&self, data: &StoreData) -> AppResult<()> {
        save_json(&self.providers_path, data)
    }

    fn save_conversations(&self, data: &ConversationStoreData) -> AppResult<()> {
        save_json(&self.conversations_path, data)
    }

    pub fn list_providers(&self) -> Vec<AiProviderConfig> {
        self.data.lock().unwrap().providers.clone()
    }

    pub fn default_provider_id(&self) -> Option<String> {
        self.data.lock().unwrap().default_provider_id.clone()
    }

    pub fn profile_block(&self) -> Option<String> {
        self.data.lock().unwrap().profile_block.clone()
    }

    pub fn set_profile_block(&self, block: String) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        data.profile_block = Some(block);
        self.save(&data)
    }

    pub fn ambient(&self) -> AmbientSettings {
        self.data.lock().unwrap().ambient.clone()
    }

    pub fn set_ambient(&self, ambient: AmbientSettings) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        data.ambient = ambient;
        self.save(&data)
    }

    /// The first provider usable for an ambient feature: default-eligible
    /// (on-device/local), or any provider once the feature's own cloud
    /// opt-in is set (PLAN §3.4).
    pub fn ambient_provider_id(&self, feature: &str) -> Option<String> {
        let data = self.data.lock().unwrap();
        let opted_in = data.ambient.cloud_opt_in.iter().any(|f| f == feature);
        data.providers
            .iter()
            .find(|p| p.is_ambient_default_eligible() || opted_in)
            .map(|p| p.id.clone())
    }

    pub fn auto_title_log(&self) -> Vec<AutoTitleRecord> {
        self.data.lock().unwrap().auto_title_log.clone()
    }

    pub fn record_auto_title(&self, record: AutoTitleRecord) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        data.auto_title_log.push(record);
        // Keep the log small — this is an undo aid, not a durable history.
        let len = data.auto_title_log.len();
        if len > 50 {
            data.auto_title_log.drain(0..len - 50);
        }
        self.save(&data)
    }

    pub fn take_auto_title_record(&self, entity_id: &str) -> AppResult<Option<AutoTitleRecord>> {
        let mut data = self.data.lock().unwrap();
        let index = data.auto_title_log.iter().position(|r| r.entity_id == entity_id);
        let record = index.map(|i| data.auto_title_log.remove(i));
        if record.is_some() {
            self.save(&data)?;
        }
        Ok(record)
    }

    pub fn file_summary(&self, file_id: &str) -> Option<String> {
        self.data.lock().unwrap().file_summaries.get(file_id).cloned()
    }

    pub fn set_file_summary(&self, file_id: &str, summary: String) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        data.file_summaries.insert(file_id.to_string(), summary);
        self.save(&data)
    }

    /// Adds (or replaces, by id) a provider config and its key. The key never
    /// touches `StoreData` — only the OS keychain.
    pub fn upsert_provider(&self, config: AiProviderConfig, api_key: Option<&str>) -> AppResult<()> {
        if let Some(key) = api_key {
            secrets::set(&config.id, key)?;
        }
        let mut data = self.data.lock().unwrap();
        data.providers.retain(|p| p.id != config.id);
        data.providers.push(config);
        if data.default_provider_id.is_none() {
            data.default_provider_id = data.providers.first().map(|p| p.id.clone());
        }
        self.save(&data)
    }

    pub fn remove_provider(&self, id: &str) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        data.providers.retain(|p| p.id != id);
        if data.default_provider_id.as_deref() == Some(id) {
            data.default_provider_id = data.providers.first().map(|p| p.id.clone());
        }
        self.save(&data)?;
        secrets::delete(id)
    }

    pub fn set_default_provider(&self, id: &str) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        if !data.providers.iter().any(|p| p.id == id) {
            return Err(AppError::NotFound(format!("provider {id}")));
        }
        data.default_provider_id = Some(id.to_string());
        self.save(&data)
    }

    /// Model ids are never hardcoded (PLAN §3.2) — this is what Settings → AI's
    /// model picker calls once the user picks one from `list_models()`.
    pub fn set_provider_model(&self, id: &str, model: &str) -> AppResult<()> {
        let mut data = self.data.lock().unwrap();
        let provider = data.providers.iter_mut().find(|p| p.id == id).ok_or_else(|| AppError::NotFound(format!("provider {id}")))?;
        provider.default_model = Some(model.to_string());
        self.save(&data)
    }

    pub fn provider_config(&self, id: &str) -> AppResult<AiProviderConfig> {
        self.data
            .lock()
            .unwrap()
            .providers
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("provider {id}")))
    }

    /// Builds a live provider instance for `id`, reading its key from the
    /// keychain. `app` is only used by the on-device provider, to reach the
    /// `tauri-plugin-apple-intelligence` app state.
    pub fn build_provider(&self, app: &tauri::AppHandle, id: &str) -> AppResult<Box<dyn AiProvider>> {
        let config = self.provider_config(id)?;
        match config.kind {
            ProviderKind::Anthropic => {
                let key = secrets::get(id)?.ok_or_else(|| missing_key(&config))?;
                Ok(Box::new(anthropic::AnthropicProvider::new(key)))
            }
            ProviderKind::OpenAi => {
                let key = secrets::get(id)?.ok_or_else(|| missing_key(&config))?;
                Ok(Box::new(openai::OpenAiProvider::new(key)))
            }
            ProviderKind::Gemini => {
                let key = secrets::get(id)?.ok_or_else(|| missing_key(&config))?;
                Ok(Box::new(gemini::GeminiProvider::new(key)))
            }
            ProviderKind::OpenAiCompatible => {
                let base_url = config
                    .base_url
                    .clone()
                    .ok_or_else(|| AppError::InvalidInput("this provider has no base URL configured".into()))?;
                let api_key = secrets::get(id)?;
                Ok(Box::new(openai_compatible::OpenAiCompatibleProvider {
                    base_url,
                    api_key,
                    context_tokens: 32_000,
                }))
            }
            ProviderKind::AppleOnDevice => {
                Ok(Box::new(apple_on_device::AppleOnDeviceProvider { app: app.clone() }))
            }
        }
    }

    /// Seeds the on-device provider config if it isn't there yet, so macOS
    /// users get it "out of the box" (PLAN §2) instead of adding it by hand
    /// through the same form as a cloud provider (it takes no key/base URL).
    /// A no-op once seeded, and safe to call on every launch.
    #[cfg(target_os = "macos")]
    pub fn ensure_apple_on_device_seeded(&self) {
        let mut data = self.data.lock().unwrap();
        if data.providers.iter().any(|p| p.kind == ProviderKind::AppleOnDevice) {
            return;
        }
        let config = AiProviderConfig {
            id: "apple-on-device".to_string(),
            kind: ProviderKind::AppleOnDevice,
            label: "Apple Intelligence".to_string(),
            base_url: None,
            default_model: Some("on-device".to_string()),
            cloud_notice_acknowledged: true,
        };
        data.providers.insert(0, config);
        if data.default_provider_id.is_none() {
            data.default_provider_id = Some("apple-on-device".to_string());
        }
        let _ = self.save(&data);
    }

    // --- conversations (PLAN §9: not entities, local only, clearable) ------

    pub fn list_conversations(&self) -> Vec<agent_loop::ConversationSummary> {
        self.conversations
            .lock()
            .unwrap()
            .conversations
            .iter()
            .map(agent_loop::ConversationSummary::from)
            .collect()
    }

    pub fn get_conversation(&self, id: &str) -> Option<agent_loop::Conversation> {
        self.conversations
            .lock()
            .unwrap()
            .conversations
            .iter()
            .find(|c| c.id == id)
            .cloned()
    }

    pub fn save_conversation(&self, conversation: agent_loop::Conversation) -> AppResult<()> {
        let mut data = self.conversations.lock().unwrap();
        data.conversations.retain(|c| c.id != conversation.id);
        data.conversations.push(conversation);
        self.save_conversations(&data)
    }

    pub fn delete_conversation(&self, id: &str) -> AppResult<()> {
        let mut data = self.conversations.lock().unwrap();
        data.conversations.retain(|c| c.id != id);
        self.save_conversations(&data)
    }

    pub fn clear_conversations(&self) -> AppResult<()> {
        let mut data = self.conversations.lock().unwrap();
        data.conversations.clear();
        self.save_conversations(&data)
    }
}

fn missing_key(config: &AiProviderConfig) -> AppError {
    AppError::InvalidInput(format!(
        "no API key saved for '{}' — add it again in Settings \u{2192} AI",
        config.label
    ))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAvailability {
    pub id: String,
    pub label: String,
    pub kind: ProviderKind,
    pub usable: bool,
    /// A short reason shown in the UI when `usable` is false (PLAN §2).
    pub unusable_reason: Option<String>,
}

/// What's usable right now, checked at launch and whenever an AI surface
/// opens (PLAN §2). Apple on-device gets a real `check_availability()` call
/// (`apple_on_device.rs`); every configured cloud/custom provider with a
/// saved key is reported usable.
pub fn availability(state: &AiState, app: &tauri::AppHandle) -> Vec<ProviderAvailability> {
    state
        .list_providers()
        .into_iter()
        .map(|config| {
            let (usable, reason) = match config.kind {
                ProviderKind::AppleOnDevice => {
                    let (available, reason) = apple_on_device::availability_status(app);
                    (available, reason)
                }
                ProviderKind::OpenAiCompatible => (true, None),
                _ => {
                    let has_key = secrets::get(&config.id).ok().flatten().is_some();
                    (has_key, (!has_key).then(|| "no API key saved".to_string()))
                }
            };
            ProviderAvailability {
                id: config.id.clone(),
                label: config.label.clone(),
                kind: config.kind,
                usable,
                unusable_reason: if usable { None } else { reason },
            }
        })
        .collect()
}
