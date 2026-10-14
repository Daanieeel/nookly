/// Every React Query key of the mobile app, broad to narrow, like the desktop's `qk`.
/// Local data all sits under `local`, so a sync that brought changes refreshes it at once.
export const keys = {
  local: ["local"] as const,
  spaces: ["local", "spaces"] as const,
  modules: (spaceId: string) => ["local", "modules", spaceId] as const,
  entities: (spaceId: string | null, types: string[], trash = false) =>
    ["local", "entities", spaceId, types.join(","), trash] as const,
  entity: (id: string) => ["local", "entity", id] as const,
  tasks: (spaceId: string | null) => ["local", "tasks", spaceId] as const,
  task: (id: string) => ["local", "task", id] as const,
  statuses: ["local", "statuses"] as const,
  blocks: (entityId: string) => ["local", "blocks", entityId] as const,
  agenda: (from: string, to: string) => ["local", "agenda", from, to] as const,
  bookmarks: (spaceId: string | null) => ["local", "bookmarks", spaceId] as const,
  search: (query: string) => ["local", "search", query] as const,
  recents: ["local", "recents"] as const,
  pinned: ["local", "pinned"] as const,
  role: (id: string) => ["local", "role", id] as const,
  sync: {
    root: ["sync"] as const,
    sessions: ["sync", "sessions"] as const,
    sharesWithMe: ["sync", "shares", "incoming"] as const,
    conflicts: ["sync", "conflicts"] as const,
  },
};
