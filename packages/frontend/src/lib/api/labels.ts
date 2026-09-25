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

/// Every live entity's label ids in a Space, keyed by entity id — one round trip
/// for filtering a whole list of items by label instead of one call per item.
export function listEntityLabelIds(spaceId: string): Promise<Record<string, string[]>> {
  return invoke("list_entity_label_ids", { spaceId });
}
