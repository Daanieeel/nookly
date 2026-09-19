import { invoke } from "@tauri-apps/api/core";
import type { SearchHit } from "./types";

export function search(query: string, spaceId: string | null = null): Promise<SearchHit[]> {
  return invoke("search", { query, spaceId });
}
