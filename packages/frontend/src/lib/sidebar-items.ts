import { create } from "zustand";
import { z } from "zod";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";

/// The cross-Space entries at the top of the sidebar, in their default order. The
/// user can reorder and hide them (the sidebar's settings button); Spaces are not
/// part of this.
export const SIDEBAR_ITEM_IDS = [
  "dashboard",
  "calendar",
  "tasks",
  "assignments",
  "pinned",
  "quick-jot",
] as const;

export type SidebarItemId = (typeof SIDEBAR_ITEM_IDS)[number];

export interface SidebarItemPref {
  id: SidebarItemId;
  hidden: boolean;
}

const DEFAULT_ITEMS: SidebarItemPref[] = SIDEBAR_ITEM_IDS.map((id) => ({ id, hidden: false }));

function isItemId(value: string): value is SidebarItemId {
  return SIDEBAR_ITEM_IDS.some((id) => id === value);
}

const storedItemsSchema = z.array(z.object({ id: z.string(), hidden: z.boolean().optional() }));

type StoredItem = z.infer<typeof storedItemsSchema>[number];

/// Keeps what is still valid from a stored list (order and hidden flags) and adds any
/// item it doesn't know yet, like one a later version introduced, at its default place.
export function normalizeSidebarItems(stored: StoredItem[]): SidebarItemPref[] {
  const seen = new Set<SidebarItemId>();
  const kept: SidebarItemPref[] = [];
  for (const { id, hidden } of stored) {
    if (!isItemId(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push({ id, hidden: hidden === true });
  }
  // A new item slots in after the item that precedes it by default, not at the end.
  for (const item of DEFAULT_ITEMS.filter((i) => !seen.has(i.id))) {
    const defaultIndex = SIDEBAR_ITEM_IDS.indexOf(item.id);
    const before = SIDEBAR_ITEM_IDS.slice(0, defaultIndex)
      .toReversed()
      .map((id) => kept.findIndex((k) => k.id === id))
      .find((i) => i !== -1);
    kept.splice(before === undefined ? 0 : before + 1, 0, item);
  }
  return kept;
}

function read(): SidebarItemPref[] {
  try {
    const raw = preferences.get(STORAGE_KEYS.sidebarItems);
    const parsed = raw ? storedItemsSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? normalizeSidebarItems(parsed.data) : DEFAULT_ITEMS;
  } catch {
    return DEFAULT_ITEMS;
  }
}

interface SidebarItemsState {
  items: SidebarItemPref[];
  setItems: (items: SidebarItemPref[]) => void;
}

export const useSidebarItems = create<SidebarItemsState>((set) => ({
  items: read(),
  setItems: (items) => {
    preferences.set(STORAGE_KEYS.sidebarItems, JSON.stringify(items));
    set({ items });
  },
}));
