import { invoke } from "@tauri-apps/api/core";
import type { Space, SpacePatch } from "./types";

export function createSpace(name: string, icon: string | null, color: string): Promise<Space> {
  return invoke("create_space", { name, icon, color });
}

export function listSpaces(): Promise<Space[]> {
  return invoke("list_spaces");
}

export function updateSpace(id: string, patch: SpacePatch): Promise<Space> {
  return invoke("update_space", { id, patch });
}

export function deleteSpace(id: string): Promise<void> {
  return invoke("delete_space", { id });
}

export function listSpaceModules(spaceId: string): Promise<string[]> {
  return invoke("list_space_modules", { spaceId });
}

export function addSpaceModule(spaceId: string, moduleKey: string): Promise<void> {
  return invoke("add_space_module", { spaceId, moduleKey });
}
