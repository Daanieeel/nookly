import { invoke } from "@tauri-apps/api/core";
import type { Entity } from "./types";

/// What importing a Nookly file would create, read from the file with nothing changed.
export interface PortablePreview {
  /// `nookly-task`, `nookly-deck`, `nookly-assignment` or `nookly-page`.
  format: string;
  /// What the file holds: `task`, `deck`, `assignment`, `note` or `jot`.
  kind: string;
  title: string;
  /// Short facts about the item: status, dates, grade.
  facts: string[];
  /// How many `countLabel`s it holds (blocks, subtasks, cards).
  count: number;
  countLabel: string;
  items: PortableItem[];
  /// Items of a kind this version does not know, which arrive as plain text.
  converted: number;
  /// The type of entity the import has to be filed under, when it has to be.
  parentType: string | null;
}

export interface PortableItem {
  /// What the item is: a block type, a status, "Card".
  label: string;
  /// Its first line, cut to fit a row.
  text: string;
  converted: boolean;
}

/// The entity types that have a file format, as `export` and `import` know them.
const PORTABLE_TYPES = new Set(["note", "jot", "task", "index_card_deck", "assignment"]);

export function isPortableType(entityType: string): boolean {
  return PORTABLE_TYPES.has(entityType);
}

/// The entity type a file's `kind` creates: a deck file makes an `index_card_deck`.
export function entityTypeOfKind(kind: string): string {
  return kind === "deck" ? "index_card_deck" : kind;
}

/// Writes the entity as a Nookly file at a path the user chose. Nothing that belongs to this
/// instance (ids, labels, links, the Space) goes in it.
export function exportEntityJson(entityId: string, path: string): Promise<void> {
  return invoke("export_entity_json", { entityId, path });
}

/// The entity as the text of a Nookly file, for sharing it without a path.
export function renderEntityJson(entityId: string): Promise<string> {
  return invoke("render_entity_json", { entityId });
}

export function previewEntityJson(path: string): Promise<PortablePreview> {
  return invoke("preview_entity_json", { path });
}

/// `previewEntityJson` for file contents the app already holds (a drop or a paste).
export function previewEntityText(text: string): Promise<PortablePreview> {
  return invoke("preview_entity_text", { text });
}

/// Creates a new entity in the Space from a Nookly file, filed under `parentId` when its type
/// needs one (an assignment needs a course). Never changes an existing entity.
export function importEntityJson(
  spaceId: string,
  path: string,
  parentId: string | null = null,
): Promise<Entity> {
  return invoke("import_entity_json", { spaceId, path, parentId });
}

/// `importEntityJson` for file contents the app already holds.
export function importEntityText(
  spaceId: string,
  text: string,
  parentId: string | null = null,
): Promise<Entity> {
  return invoke("import_entity_text", { spaceId, text, parentId });
}
