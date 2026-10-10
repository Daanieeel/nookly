import { invoke } from "@tauri-apps/api/core";
import { ENTITY_RENAMED } from "#/lib/rename-sync.ts";
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

export async function updateEntity(id: string, patch: EntityPatch): Promise<Entity> {
  const entity = await invoke<Entity>("update_entity", { id, patch });
  // A new title also rewrites the mentions that showed the old one, on other pages.
  if (patch.title !== undefined) window.dispatchEvent(new Event(ENTITY_RENAMED));
  return entity;
}

export function listEntities(spaceId: string | null, includeDeleted: boolean): Promise<Entity[]> {
  return invoke("list_entities", { spaceId, includeDeleted });
}

/// Records that `id` was just opened, for a future smart 'reclaim space' feature.
/// Fire-and-forget: callers don't await it, and a failure never blocks navigation.
export function touchEntityOpened(id: string): Promise<void> {
  return invoke("touch_entity_opened", { id });
}

export function softDeleteEntity(id: string): Promise<void> {
  return invoke("soft_delete_entity", { id });
}

export function restoreEntity(id: string): Promise<void> {
  return invoke("restore_entity", { id });
}

/// Permanently removes everything in the Trash; resolves to how many items went.
export function emptyTrash(): Promise<number> {
  return invoke("empty_trash");
}

export function hardDeleteEntity(id: string): Promise<void> {
  return invoke("hard_delete_entity", { id });
}

/// A copy in the same Space, titled "<title> (copy)", with the same fields, icon,
/// labels and block content.
export function duplicateEntity(id: string): Promise<Entity> {
  return invoke("duplicate_entity", { id });
}

/// Turns an entity into another type in place (same id, relationships and
/// labels), through the conversions the backend registers.
export function convertEntity(id: string, to: string): Promise<Entity> {
  return invoke("convert_entity", { id, to });
}
