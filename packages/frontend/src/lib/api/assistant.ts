import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ProviderKind = "apple-on-device" | "anthropic" | "open-ai" | "gemini" | "open-ai-compatible";

export interface AiProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  cloudNoticeAcknowledged: boolean;
}

export interface ProviderAvailability {
  id: string;
  label: string;
  kind: ProviderKind;
  usable: boolean;
  unusableReason: string | null;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  contextTokens: number;
}

export interface AmbientSettings {
  autoTitleJots: boolean;
  suggestLabelsRelationships: boolean;
  summarizeFilesOnUpload: boolean;
  cloudOptIn: string[];
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: unknown;
}

export interface Message {
  role: Role;
  text?: string;
  /// A provider's reasoning/thinking trace for this turn, when it sent one
  /// (on-device Apple Intelligence today; cloud providers don't wire this yet).
  reasoning?: string;
  /// Omitted by the backend entirely when empty, not an empty array.
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface PendingToolCall {
  toolCall: ToolCall;
  isWrite: boolean;
  preview: unknown;
  resolved: boolean | null;
}

export interface Conversation {
  id: string;
  title: string | null;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  pending: PendingToolCall[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  providerId: string;
  updatedAt: string;
  awaitingConfirmation: boolean;
}

export type StreamEvent =
  | { kind: "textDelta"; text: string }
  | { kind: "reasoningDelta"; text: string }
  | { kind: "toolCalls"; calls: ToolCall[] }
  | { kind: "structured"; value: unknown }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function aiAvailability(): Promise<ProviderAvailability[]> {
  return invoke("ai_availability");
}

export function aiListProviders(): Promise<AiProviderConfig[]> {
  return invoke("ai_list_providers");
}

export function aiAddProvider(input: {
  id?: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string;
  cloudNoticeAcknowledged: boolean;
}): Promise<AiProviderConfig> {
  return invoke("ai_add_provider", { input });
}

export function aiRemoveProvider(id: string): Promise<void> {
  return invoke("ai_remove_provider", { id });
}

export function aiSetDefaultProvider(id: string): Promise<void> {
  return invoke("ai_set_default_provider", { id });
}

export function aiDefaultProviderId(): Promise<string | null> {
  return invoke("ai_default_provider_id");
}

export function aiSetProviderModel(id: string, model: string): Promise<void> {
  return invoke("ai_set_provider_model", { id, model });
}

export function aiProviderCapabilities(id: string): Promise<ProviderCapabilities> {
  return invoke("ai_provider_capabilities", { id });
}

export function aiListModels(id: string): Promise<ModelInfo[]> {
  return invoke("ai_list_models", { id });
}

export function aiTestProvider(id: string): Promise<boolean> {
  return invoke("ai_test_provider", { id });
}

export function aiReadProfileFile(path: string): Promise<string> {
  return invoke("ai_read_profile_file", { path });
}

export function aiGetProfile(): Promise<string | null> {
  return invoke("ai_get_profile");
}

export function aiSetProfile(block: string): Promise<void> {
  return invoke("ai_set_profile", { block });
}

export function aiGetAmbient(): Promise<AmbientSettings> {
  return invoke("ai_get_ambient");
}

export function aiSetAmbient(ambient: AmbientSettings): Promise<void> {
  return invoke("ai_set_ambient", { ambient });
}

export interface AutoTitleRecord {
  entityId: string;
  entityKey: string;
  previousTitle: string;
  newTitle: string;
  appliedAt: string;
}

export function aiRunAutoTitleNow(): Promise<unknown[]> {
  return invoke("ai_run_auto_title_now");
}

export function aiAutoTitleLog(): Promise<AutoTitleRecord[]> {
  return invoke("ai_auto_title_log");
}

export function aiUndoAutoTitle(entityId: string): Promise<boolean> {
  return invoke("ai_undo_auto_title", { entityId });
}

export function aiRunFileSummaryNow(): Promise<unknown[]> {
  return invoke("ai_run_file_summary_now");
}

export function aiFileSummary(fileId: string): Promise<string | null> {
  return invoke("ai_file_summary", { fileId });
}

export interface QuizQuestion {
  question: string;
  answer: string;
}

export function aiGenerateQuiz(entityId: string, count: number): Promise<QuizQuestion[]> {
  return invoke("ai_generate_quiz", { entityId, count });
}

export function aiListConversations(): Promise<ConversationSummary[]> {
  return invoke("ai_list_conversations");
}

export function aiGetConversation(id: string): Promise<Conversation | null> {
  return invoke("ai_get_conversation", { id });
}

export function aiNewConversation(providerId: string | undefined, model: string): Promise<Conversation> {
  return invoke("ai_new_conversation", { providerId, model });
}

export function aiDeleteConversation(id: string): Promise<void> {
  return invoke("ai_delete_conversation", { id });
}

export function aiClearConversations(): Promise<void> {
  return invoke("ai_clear_conversations");
}

export function aiSendMessage(conversationId: string, text: string): Promise<Conversation> {
  return invoke("ai_send_message", { conversationId, text });
}

export function aiResolvePending(
  conversationId: string,
  decisions: Record<string, boolean>,
): Promise<Conversation> {
  return invoke("ai_resolve_pending", { conversationId, decisions });
}

/// Live tokens/tool status for one conversation while `ai_send_message` or
/// `ai_resolve_pending` runs, on `ai:stream:<conversationId>` — the same
/// event-per-progress pattern the LibreOffice installer already uses.
export function listenToConversationStream(
  conversationId: string,
  onEvent: (event: StreamEvent) => void,
): Promise<UnlistenFn> {
  return listen<StreamEvent>(`ai:stream:${conversationId}`, (e) => onEvent(e.payload));
}
