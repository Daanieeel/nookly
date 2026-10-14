/// How an entity's or Space's `icon` string is written, the same on every client. It is
/// either a literal emoji or a pick from the icon library: `icon:<name>`, optionally
/// followed by `#rrggbb` to tint it (`icon:Star#f59e0b`). Each client draws the names
/// with its own Tabler package; a test keeps the desktop's drawn set equal to this list.

export const ICON_LIBRARY_PREFIX = "icon:";

/// The icons the picker offers, in its order.
export const ICON_LIBRARY_NAMES = [
  "Folder",
  "Book",
  "School",
  "Checklist",
  "Notes",
  "Feather",
  "FileText",
  "Sparkles",
  "Chalkboard",
  "Writing",
  "Cards",
  "Clock",
  "ClipboardList",
  "File",
  "Bookmark",
  "Kitchen",
  "CalendarStats",
  "Star",
  "Heart",
  "Flag",
  "Target",
  "Rocket",
  "Bulb",
  "Trophy",
  "Home",
  "Briefcase",
  "Code",
  "Palette",
  "Music",
  "Coffee",
  "Apple",
  "Plant",
  "Sun",
  "Plane",
  "Bike",
] as const;

export type IconLibraryName = (typeof ICON_LIBRARY_NAMES)[number];

export function isIconLibraryValue(value: string): boolean {
  return value.startsWith(ICON_LIBRARY_PREFIX);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function iconLibraryValue(name: string, color?: string | null): string {
  return `${ICON_LIBRARY_PREFIX}${name}${color && HEX_COLOR.test(color) ? color : ""}`;
}

export interface IconLibraryChoice {
  name: string;
  /// `null` when untinted.
  color: string | null;
}

export function parseIconLibraryValue(value: string): IconLibraryChoice {
  const rest = value.slice(ICON_LIBRARY_PREFIX.length);
  const at = rest.indexOf("#");
  if (at === -1) return { name: rest, color: null };
  const color = rest.slice(at);
  return { name: rest.slice(0, at), color: HEX_COLOR.test(color) ? color : null };
}
