import type { ActiveFilter } from "#/components/filter-menu.tsx";

/// Filters another page asked a list page to open with (a Dashboard "Show more"), keyed
/// by the page's filter preference key. They apply to that one visit and are never
/// saved, so the page's own saved default stays as it was.
const requests = new Map<string, { filters: ActiveFilter[]; at: number }>();

/// How long a request stays valid. It is not removed on read, because a page may read
/// its initial state more than once while it mounts.
const FRESH_MS = 3000;

export function requestFilters(key: string, filters: ActiveFilter[]) {
  requests.set(key, { filters, at: Date.now() });
}

export function pendingFilters(key: string): ActiveFilter[] | undefined {
  const request = requests.get(key);
  return request && Date.now() - request.at < FRESH_MS ? request.filters : undefined;
}
