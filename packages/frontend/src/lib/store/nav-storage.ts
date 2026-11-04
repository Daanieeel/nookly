/// What the navigation store saves between launches, and reads back when it starts.

import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import type { RecentEntry } from "./nav.ts";

export function readStoredCollapsed(): boolean {
  return preferences.get(STORAGE_KEYS.sidebarCollapsed) === "1";
}

/// Bounds for the resizable right sidebar. The minimum fits its widest property
/// row in full: the 6rem label, a number stepper with its unit, the clear button
/// and the save status slot (`NumberProperty`), plus the `p-3` padding.
export const RIGHT_SIDEBAR_MIN_WIDTH = 312;
export const RIGHT_SIDEBAR_MAX_WIDTH = 480;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;

export function clampRightSidebarWidth(width: number): number {
  return Math.min(RIGHT_SIDEBAR_MAX_WIDTH, Math.max(RIGHT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function readStoredRightSidebarWidth(): number {
  const stored = Number(preferences.get(STORAGE_KEYS.rightSidebarWidth));
  return stored ? clampRightSidebarWidth(stored) : RIGHT_SIDEBAR_DEFAULT_WIDTH;
}

export function readStoredRightSidebarCollapsed(): boolean {
  return preferences.get(STORAGE_KEYS.rightSidebarCollapsed) === "1";
}

export function readStoredActiveSpace(): string | null {
  return preferences.get(STORAGE_KEYS.activeSpace);
}

export function writeStoredActiveSpace(spaceId: string | null) {
  if (spaceId) preferences.set(STORAGE_KEYS.activeSpace, spaceId);
  else preferences.remove(STORAGE_KEYS.activeSpace);
}

export function readStoredRecents(): RecentEntry[] {
  try {
    const raw = preferences.get(STORAGE_KEYS.recents);
    // SAFETY: this key is only ever written by `writeStoredRecents` below, with the
    // exact `RecentEntry[]` shape — never user-editable or written by anything else.
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredRecents(recents: RecentEntry[]) {
  preferences.set(STORAGE_KEYS.recents, JSON.stringify(recents));
}
