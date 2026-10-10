import { invoke } from "@tauri-apps/api/core";

/// Markdown files the user keeps for their own coding agent. See
/// `src-tauri/src/commands/agent_files.rs`.

export interface AgentFile {
  name: string;
  size: number;
  /// RFC 3339, empty when unknown.
  modified: string;
}

/// The file coding agents open first. It always exists and cannot be deleted.
export const AGENT_ENTRY_FILE = "AGENTS.md";

export function agentDirPath(): Promise<string> {
  return invoke("agent_dir_path");
}

export function listAgentFiles(): Promise<AgentFile[]> {
  return invoke("list_agent_files");
}

export function readAgentFile(name: string): Promise<string> {
  return invoke("read_agent_file", { name });
}

export function writeAgentFile(name: string, content: string): Promise<void> {
  return invoke("write_agent_file", { name, content });
}

export function deleteAgentFile(name: string): Promise<void> {
  return invoke("delete_agent_file", { name });
}

export function revealAgentDir(): Promise<void> {
  return invoke("reveal_agent_dir");
}
