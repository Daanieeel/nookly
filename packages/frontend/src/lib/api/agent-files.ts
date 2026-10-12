import { invoke } from "@tauri-apps/api/core";

/// Markdown files the user keeps for their own coding agent. See
/// `src-tauri/src/commands/agent_files.rs`. A file name is its path below the folder,
/// like `Work/PROFILE.md`.

export interface AgentFile {
  name: string;
  size: number;
  /// RFC 3339, empty when unknown.
  modified: string;
}

/// The file coding agents open first. It always exists and cannot be deleted.
export const AGENT_ENTRY_FILE = "AGENTS.md";

/// The files every agent folder has, which cannot be deleted (the backend refuses too).
const STANDARD_AGENT_FILES = [AGENT_ENTRY_FILE, "NOOKLY.md"];

/// Folder levels plus the file, as the backend allows.
export const AGENT_MAX_DEPTH = 5;

export function agentParent(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

export function agentDepth(folder: string): number {
  return folder ? folder.split("/").length : 0;
}

/// Only the two files at the top are standard; a file of the same name in a folder is not.
export function isStandardAgentFile(name: string): boolean {
  return STANDARD_AGENT_FILES.some((standard) => standard.toLowerCase() === name.toLowerCase());
}

export function agentDirPath(): Promise<string> {
  return invoke("agent_dir_path");
}

export function listAgentFiles(): Promise<AgentFile[]> {
  return invoke("list_agent_files");
}

export function listAgentFolders(): Promise<string[]> {
  return invoke("list_agent_folders");
}

export function createAgentFolder(path: string): Promise<void> {
  return invoke("create_agent_folder", { path });
}

export function deleteAgentFolder(path: string): Promise<void> {
  return invoke("delete_agent_folder", { path });
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
