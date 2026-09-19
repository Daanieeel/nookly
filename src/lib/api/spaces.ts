import { invoke } from "@tauri-apps/api/core";
import type { Space } from "./types";

export function createSpace(name: string, icon: string | null, color: string): Promise<Space> {
  return invoke("create_space", { name, icon, color });
}

export function listSpaces(): Promise<Space[]> {
  return invoke("list_spaces");
}
