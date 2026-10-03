import { invoke } from "@tauri-apps/api/core";
import type { Entity } from "./types";

/// Modules whose page can be saved as a View. Mirrors `VIEW_MODULES` in
/// `src-tauri/src/db/views.rs`.
export const VIEW_MODULES = [
  "tasks",
  "assignments",
  "tasks-overview",
  "assignments-overview",
] as const;
export type ViewModule = (typeof VIEW_MODULES)[number];

/// The cross-Space Tasks and Assignments pages. Their Views live in one Space like
/// any entity, but show the items of every Space.
export const TASKS_OVERVIEW = "tasks-overview";
export const ASSIGNMENTS_OVERVIEW = "assignments-overview";
export type OverviewModule = typeof TASKS_OVERVIEW | typeof ASSIGNMENTS_OVERVIEW;

/// A module with a page of its own inside a Space.
export type SpaceViewModule = Exclude<ViewModule, OverviewModule>;

export function isViewModule(module: string): module is SpaceViewModule {
  return module === "tasks" || module === "assignments";
}

/// A saved View of a module page. `config` is the JSON its page saved; read it
/// with `parseViewConfig` (`features/views/view-config.ts`).
export interface SavedView {
  entity: Entity;
  module: ViewModule;
  config: string;
  /// Sidebar order among the Space's Views of this module, lowest first.
  position: number;
}

export function createView(
  spaceId: string,
  title: string,
  module: ViewModule,
  config: string,
  icon: string | null,
): Promise<SavedView> {
  return invoke("create_view", { spaceId, title, module, config, icon });
}

export function listViews(spaceId: string, module: ViewModule | null): Promise<SavedView[]> {
  return invoke("list_views", { spaceId, module });
}

export function getView(entityId: string): Promise<SavedView> {
  return invoke("get_view", { entityId });
}

export function updateViewConfig(entityId: string, config: string): Promise<SavedView> {
  return invoke("update_view_config", { entityId, config });
}

/// Puts the Space's Views of `module` in the order of `ids`, which must list each once.
export function reorderViews(spaceId: string, module: ViewModule, ids: string[]): Promise<void> {
  return invoke("reorder_views", { spaceId, module, ids });
}

/// Puts a cross-Space page's Views, kept in different Spaces, in the order of `ids`.
export function reorderOverviewViews(module: OverviewModule, ids: string[]): Promise<void> {
  return invoke("reorder_overview_views", { module, ids });
}
