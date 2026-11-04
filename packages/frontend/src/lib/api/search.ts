import { invoke } from "@tauri-apps/api/core";
import type { SearchHit } from "./types";

export interface SearchRequest {
  query: string;
  /// Only this Space. Left out, search spans every Space (§6).
  spaceId?: string;
  /// Only these entity types. Left out or empty, every type.
  types?: string[];
  /// Label names the entity must all carry, in any Space.
  labels?: string[];
  /// Titles and keys only: no body search and no snippets.
  titlesOnly?: boolean;
  limit?: number;
}

/// Grows with every call, from the clock so a reloaded window never starts below an
/// id the backend already saw. The backend gives up on any search older than the
/// newest it knows, so stale keystrokes cost nothing.
let lastRequestId = 0;

/// One ranked list, one row per entity, best match first. Resolves to an empty
/// list when a newer search took over, which the caller has dropped by then.
export function search(request: SearchRequest): Promise<SearchHit[]> {
  lastRequestId = Math.max(Date.now(), lastRequestId + 1);
  return invoke("search", {
    request: { ...request, onePerEntity: true },
    requestId: lastRequestId,
  });
}
