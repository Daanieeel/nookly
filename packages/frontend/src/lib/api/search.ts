import { invoke } from "@tauri-apps/api/core";
import type { SearchHit } from "./types";

export function search(query: string, spaceId: string | null = null): Promise<SearchHit[]> {
  return invoke("search", { query, spaceId });
}

/// Notes pages rendered inline on another entity's page (Course/Semester Notes).
export function listEmbeddedPageIds(): Promise<string[]> {
  return invoke("list_embedded_page_ids");
}
