import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCloud, IconHistory, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { MascotFigure } from "#/components/mascot-figure.tsx";
import {
  type ConversationSummary,
  type Message,
  type StreamEvent,
  type ToolCall,
  aiAvailability,
  aiClearConversations,
  aiDefaultProviderId,
  aiDeleteConversation,
  aiGetConversation,
  aiListConversations,
  aiListProviders,
  aiNewConversation,
  aiProviderCapabilities,
  aiResolvePending,
  aiSendMessage,
  listenToConversationStream,
} from "#/lib/api/assistant.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtStep } from "@nookly/ui/components/chain-of-thought";
import { Confirmation } from "@nookly/ui/components/confirmation";
import { Context, ContextContent, ContextTrigger } from "@nookly/ui/components/context";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@nookly/ui/components/conversation";
import { Message as ChatMessage, MessageContent, MessageResponse } from "@nookly/ui/components/message";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import {
  type PromptInputStatus,
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@nookly/ui/components/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@nookly/ui/components/reasoning";
import { Shimmer } from "@nookly/ui/components/shimmer";
import { Suggestion, Suggestions } from "@nookly/ui/components/suggestion";
import { ToolInput, ToolOutput } from "@nookly/ui/components/tool";
import { cn } from "@nookly/ui/lib/utils";
import { useNavStore } from "#/lib/store/nav.ts";

const SUGGESTED_PROMPTS = ["What's due this week?", "Summarize my unrefined jots", "Quiz me on my most recent course"];

/// The subset of each generic tool's own argument shape (`ai::tools::tool_specs`
/// on the backend) these labels read. Every field is optional since the model
/// fills only what its tool call needs.
interface ToolCallArgs {
  entity_type?: string;
  id?: string;
  title?: string;
  query?: string;
  from_id?: string;
  relationship_type?: string;
  relationship_id?: string;
  action?: string;
}

/// A human phrase for one tool call — imperative for a write awaiting
/// confirmation ("Create task ..."), present-continuous for a read that
/// already ran freely ("Searching for ..."). Shared by the Confirmation card
/// and the Chain of Thought trail so the same call reads the same way
/// everywhere (chat visual design's "one shared message renderer").
function describeToolCall(call: ToolCall, tense: "imperative" | "continuous" = "imperative"): string {
  // SAFETY: `arguments` always comes from a JSON-schema-constrained tool call
  // matching one of the fixed generic tools, so its shape is `ToolCallArgs`.
  const args = call.arguments as ToolCallArgs;
  const continuous = tense === "continuous";
  switch (call.name) {
    case "search":
      return continuous ? `Searching for "${args.query ?? ""}"` : `Search for "${args.query ?? ""}"`;
    case "list":
      return continuous ? `Listing ${args.entity_type ?? "entities"}` : `List ${args.entity_type ?? "entities"}`;
    case "get":
      return continuous ? `Reading ${args.id ?? ""}` : `Read ${args.id ?? ""}`;
    case "describe":
    case "schema":
      return continuous ? "Checking the data model" : "Check the data model";
    case "navigate":
      return continuous ? `Opening ${args.id ?? ""}` : `Open ${args.id ?? ""}`;
    case "create":
      return `Create ${args.entity_type ?? "entity"} "${args.title ?? ""}"`;
    case "update":
      return `Update ${args.entity_type ?? "entity"} ${args.id ?? ""}`;
    case "delete":
      return `Delete ${args.entity_type ?? "entity"} ${args.id ?? ""}`;
    case "restore":
      return `Restore ${args.entity_type ?? "entity"} ${args.id ?? ""}`;
    case "relate":
      return `Relate ${args.from_id ?? ""} (${args.relationship_type ?? ""})`;
    case "unrelate":
      return `Remove relationship ${args.relationship_id ?? ""}`;
    case "run_action":
      return `Run "${args.action ?? ""}" on ${args.entity_type ?? "entity"} ${args.id ?? ""}`;
    default:
      return call.name;
  }
}

const WRITE_TOOLS = new Set(["create", "update", "delete", "restore", "relate", "unrelate", "run_action"]);

/// One assistant turn's tool calls, shown as a quiet collapsible trail
/// (chat visual design §8.3) rather than a verbose log or a raw JSON dump.
function ToolTrail({ calls, streaming }: { calls: ToolCall[]; streaming?: boolean }) {
  if (calls.length === 0) return null;
  return (
    <ChainOfThought defaultOpen={false} className="mb-2">
      <ChainOfThoughtHeader>
        {streaming ? <Shimmer duration={1.2}>Working...</Shimmer> : `Used ${calls.length} tool${calls.length === 1 ? "" : "s"}`}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {calls.map((call) => (
          <ChainOfThoughtStep
            key={call.id}
            status={streaming ? "active" : "complete"}
            label={describeToolCall(call, "continuous")}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <ChatMessage from="user">
        <MessageContent>{message.text}</MessageContent>
      </ChatMessage>
    );
  }
  if (message.role !== "assistant") return null;
  if (!message.text && !message.reasoning && !message.toolCalls?.length) return null;
  return (
    <ChatMessage from="assistant">
      {message.reasoning && (
        <Reasoning>
          <ReasoningTrigger />
          <ReasoningContent>{message.reasoning}</ReasoningContent>
        </Reasoning>
      )}
      {message.toolCalls?.length ? <ToolTrail calls={message.toolCalls} /> : null}
      {message.text && (
        <MessageContent>
          <MessageResponse>{message.text}</MessageResponse>
        </MessageContent>
      )}
    </ChatMessage>
  );
}

export function AssistantPage() {
  const queryClient = useQueryClient();
  const pendingAssistantConversationId = useNavStore((s) => s.pendingAssistantConversationId);
  const clearPendingAssistantConversation = useNavStore((s) => s.clearPendingAssistantConversation);
  const [conversationId, setConversationId] = useState<string | null>(pendingAssistantConversationId);
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [streamingCalls, setStreamingCalls] = useState<ToolCall[]>([]);

  // "Ask Assistant" (Cmd+K) hands off a conversation it already created and
  // sent the first message to; adopt it once, then clear the handoff.
  useEffect(() => {
    if (!pendingAssistantConversationId) return;
    setConversationId(pendingAssistantConversationId);
    clearPendingAssistantConversation();
  }, [pendingAssistantConversationId, clearPendingAssistantConversation]);

  const { data: providers = [] } = useQuery({ queryKey: ["ai-providers"], queryFn: aiListProviders });
  const { data: availability = [] } = useQuery({ queryKey: ["ai-availability"], queryFn: aiAvailability });
  const { data: defaultProviderId } = useQuery({ queryKey: ["ai-default-provider"], queryFn: aiDefaultProviderId });
  const { data: conversations = [] } = useQuery({ queryKey: ["ai-conversations"], queryFn: aiListConversations });
  const { data: conversation } = useQuery({
    queryKey: ["ai-conversation", conversationId],
    queryFn: () => {
      if (!conversationId) throw new Error("no active conversation");
      return aiGetConversation(conversationId);
    },
    enabled: !!conversationId,
  });

  const preferredProviderId = defaultProviderId ?? providers[0]?.id;
  const preferredUsable = availability.find((a) => a.id === preferredProviderId)?.usable ?? false;
  // The default provider might not be ready yet (e.g. Apple Intelligence still
  // downloading its model) while a configured cloud provider already works —
  // fall back to any usable one rather than blocking the composer outright.
  const fallbackUsableId = availability.find((a) => a.usable)?.id;
  const activeProviderId =
    conversation?.providerId ?? (preferredUsable ? preferredProviderId : (fallbackUsableId ?? preferredProviderId));
  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const activeAvailability = availability.find((a) => a.id === activeProviderId);
  const isUsable = activeAvailability?.usable ?? false;

  const { data: capabilities } = useQuery({
    queryKey: ["ai-capabilities", activeProviderId],
    queryFn: () => {
      if (!activeProviderId) throw new Error("no active provider");
      return aiProviderCapabilities(activeProviderId);
    },
    enabled: !!activeProviderId && isUsable,
  });

  useEffect(() => {
    if (!conversationId) return;
    setStreamText("");
    setStreamReasoning("");
    setStreamingCalls([]);
    let disposed = false;
    const unlistenPromise = listenToConversationStream(conversationId, (event: StreamEvent) => {
      if (disposed) return;
      if (event.kind === "textDelta") setStreamText((t) => t + event.text);
      if (event.kind === "reasoningDelta") setStreamReasoning((t) => t + event.text);
      if (event.kind === "toolCalls") setStreamingCalls(event.calls);
      if (event.kind === "done" || event.kind === "structured") {
        setStreamText("");
        setStreamReasoning("");
        setStreamingCalls([]);
      }
    });
    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [conversationId]);

  const newConversation = useMutation({
    mutationFn: () => aiNewConversation(activeProviderId, activeProvider?.defaultModel ?? ""),
    onSuccess: (created) => {
      setConversationId(created.id);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });

  const send = useMutation({
    mutationFn: (text: string) => {
      if (!conversationId) throw new Error("no active conversation");
      return aiSendMessage(conversationId, text);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-conversation", conversationId], updated);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });

  const resolve = useMutation({
    mutationFn: (decisions: Record<string, boolean>) => {
      if (!conversationId) throw new Error("no active conversation");
      return aiResolvePending(conversationId, decisions);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-conversation", conversationId], updated);
    },
  });

  const clearAll = useMutation({
    mutationFn: aiClearConversations,
    onSuccess: () => {
      setConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!conversationId) {
      newConversation.mutate(undefined, {
        onSuccess: (created) => {
          setConversationId(created.id);
          send.mutate(trimmed, { onSuccess: (updated) => queryClient.setQueryData(["ai-conversation", created.id], updated) });
        },
      });
      return;
    }
    setInput("");
    send.mutate(trimmed);
  }

  const isEmpty = !conversationId || (conversation?.messages.length ?? 0) === 0;
  const isStreaming = send.isPending || resolve.isPending;
  const promptStatus: PromptInputStatus = isStreaming
    ? streamText || streamReasoning || streamingCalls.length
      ? "streaming"
      : "submitted"
    : "idle";

  return (
    <div className="mx-auto flex h-full max-w-[760px] flex-col px-4">
      <div className="flex items-center justify-between gap-2 border-b border-input py-3">
        <div className="flex items-center gap-2">
          <MascotFigure size={24} />
          <span className="text-sm font-medium">Assistant</span>
          {activeProvider && (
            <Badge variant="secondary" className="gap-1">
              {activeProvider.kind !== "apple-on-device" && <IconCloud size={12} />}
              {activeProvider.label} · {activeProvider.kind === "apple-on-device" ? "on-device" : "cloud"}
            </Badge>
          )}
          {capabilities && (
            <Context>
              <ContextTrigger contextTokens={capabilities.contextTokens} />
              <ContextContent contextTokens={capabilities.contextTokens} />
            </Context>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Conversation history">
                <IconHistory />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              {conversations.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No conversations yet.</p>}
              {conversations.map((c: ConversationSummary) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setConversationId(c.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    c.id === conversationId && "bg-accent",
                  )}
                >
                  <span className="truncate">{c.title ?? "Untitled conversation"}</span>
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    onClick={(e) => {
                      e.stopPropagation();
                      void aiDeleteConversation(c.id).then(() => queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }));
                    }}
                  >
                    <IconTrash size={14} className="text-muted-foreground hover:text-destructive" />
                  </button>
                </button>
              ))}
              {conversations.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => clearAll.mutate()}>
                  Clear all
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="iconSm" aria-label="New conversation" onClick={() => newConversation.mutate()}>
            <IconPlus />
          </Button>
        </div>
      </div>

      <Conversation>
        <ConversationContent>
          {isEmpty ? (
            <ConversationEmptyState>
              <MascotFigure size={48} />
              <p className="text-sm text-muted-foreground">Ask about anything in Nookly, across every Space.</p>
              <Suggestions>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Suggestion key={prompt} suggestion={prompt} onClick={submit} />
                ))}
              </Suggestions>
            </ConversationEmptyState>
          ) : (
            <>
              {conversation?.messages.map((message, i) => <MessageBubble key={i} message={message} />)}
              {conversation?.pending
                .filter((p) => p.isWrite)
                .map((pending) => (
                  <Confirmation
                    key={pending.toolCall.id}
                    summary={describeToolCall(pending.toolCall)}
                    details={
                      <div className="space-y-3">
                        <ToolInput input={pending.toolCall.arguments} />
                        <ToolOutput output={pending.preview} />
                      </div>
                    }
                    destructive={pending.toolCall.name === "delete"}
                    resolved={pending.resolved}
                    onConfirm={() => resolve.mutate({ [pending.toolCall.id]: true })}
                    onCancel={() => resolve.mutate({ [pending.toolCall.id]: false })}
                  />
                ))}
              {streamReasoning && (
                <ChatMessage from="assistant">
                  <Reasoning isStreaming>
                    <ReasoningTrigger />
                    <ReasoningContent>{streamReasoning}</ReasoningContent>
                  </Reasoning>
                </ChatMessage>
              )}
              {streamingCalls.length > 0 && (
                <ChatMessage from="assistant">
                  <ToolTrail calls={streamingCalls.filter((c) => !WRITE_TOOLS.has(c.name))} streaming />
                </ChatMessage>
              )}
              {streamText && (
                <ChatMessage from="assistant">
                  <MessageContent>
                    <MessageResponse>{streamText}</MessageResponse>
                  </MessageContent>
                </ChatMessage>
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="mb-3"
      >
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isUsable
              ? "Ask the assistant..."
              : providers.length === 0
                ? "Add an AI provider in Settings to get started"
                : (activeAvailability?.unusableReason ?? `${activeProvider?.label ?? "This provider"} isn't ready yet`)
          }
          disabled={!isUsable || isStreaming}
        />
        <PromptInputToolbar>
          <PromptInputTools />
          <PromptInputSubmit status={promptStatus} disabled={!isUsable || isStreaming || !input.trim()} />
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}
