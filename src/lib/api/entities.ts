import { invoke } from "@tauri-apps/api/core";
import type { Entity, EntityPatch } from "./types";

export function createEntity(
  spaceId: string,
  type: string,
  title: string,
  icon: string | null,
): Promise<Entity> {
  return invoke("create_entity", { spaceId, type, title, icon });
}

export function getEntity(id: string): Promise<Entity> {
  return invoke("get_entity", { id });
}

export function updateEntity(id: string, patch: EntityPatch): Promise<Entity> {
  return invoke("update_entity", { id, patch });
}

export function listEntities(spaceId: string | null, includeDeleted: boolean): Promise<Entity[]> {
  return invoke("list_entities", { spaceId, includeDeleted });
}

export function softDeleteEntity(id: string): Promise<void> {
  return invoke("soft_delete_entity", { id });
}

export function restoreEntity(id: string): Promise<void> {
  return invoke("restore_entity", { id });
}
