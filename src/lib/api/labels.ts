import { invoke } from "@tauri-apps/api/core";
import type { Label } from "./types";

export function createLabel(spaceId: string, name: string, color: string): Promise<Label> {
  return invoke("create_label", { spaceId, name, color });
}

export function listLabels(spaceId: string): Promise<Label[]> {
  return invoke("list_labels", { spaceId });
}

export function updateLabel(id: string, patch: { name?: string; color?: string }): Promise<Label> {
  return invoke("update_label", { id, name: patch.name ?? null, color: patch.color ?? null });
}

export function deleteLabel(id: string): Promise<void> {
  return invoke("delete_label", { id });
}

export function attachLabel(entityId: string, labelId: string): Promise<void> {
  return invoke("attach_label", { entityId, labelId });
}

export function detachLabel(entityId: string, labelId: string): Promise<void> {
  return invoke("detach_label", { entityId, labelId });
}

export function listLabelsForEntity(entityId: string): Promise<Label[]> {
  return invoke("list_labels_for_entity", { entityId });
}
