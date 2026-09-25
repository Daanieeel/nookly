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

/// Applies a full drag-to-reorder drop: every Space id, in its new order.
export function reorderSpaces(orderedIds: string[]): Promise<void> {
  return invoke("reorder_spaces", { orderedIds });
}

export function listSpaceModules(spaceId: string): Promise<string[]> {
  return invoke("list_space_modules", { spaceId });
}

export function addSpaceModule(spaceId: string, moduleKey: string): Promise<void> {
  return invoke("add_space_module", { spaceId, moduleKey });
}

/// Applies a full drag-to-reorder drop within one Space: every module key it
/// currently has, in the new order.
export function reorderSpaceModules(spaceId: string, orderedKeys: string[]): Promise<void> {
  return invoke("reorder_space_modules", { spaceId, orderedKeys });
}
