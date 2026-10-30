import { invoke } from "@tauri-apps/api/core";

/// An AI app found on this computer.
export interface AiApp {
  id: string;
  name: string;
}

export function listAiApps(): Promise<AiApp[]> {
  return invoke("list_ai_apps");
}

/// Starts an installed app on the agent folder.
export function openAgentDirIn(appId: string): Promise<void> {
  return invoke("open_agent_dir_in", { appId });
}
