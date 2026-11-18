import { z } from "zod";

/// The overviews at the top of the sidebar, in the order and with the ones hidden that this
/// phone remembers, like the desktop's.

export const TOP_ITEMS = [
  { id: "dashboard", label: "Dashboard", href: "/" },
  { id: "calendar", label: "Calendar", href: "/calendar" },
  { id: "tasks", label: "Tasks", href: "/tasks" },
  { id: "assignments", label: "Assignments", href: "/assignments" },
  { id: "pinned", label: "Pinned", href: "/pinned" },
  { id: "jot", label: "Quick Jot", href: "/new/jot" },
] as const;

export type TopId = (typeof TOP_ITEMS)[number]["id"];
const IDS = TOP_ITEMS.map((i) => i.id);

export const topSchema = z.object({ order: z.array(z.string()), hidden: z.array(z.string()) });
export type TopPreference = z.infer<typeof topSchema>;
export const DEFAULT_TOP: TopPreference = { order: IDS, hidden: [] };

/// The items to show: remembered order first, then any item the memory doesn't know (one
/// added later), without the hidden and without anything unknown.
export function visibleTop(pref: TopPreference): (typeof TOP_ITEMS)[number][] {
  const known = pref.order.filter((id) => IDS.some((x) => x === id));
  const order = [...known, ...IDS.filter((id) => !known.includes(id))];
  return order
    .filter((id) => !pref.hidden.includes(id))
    .flatMap((id) => TOP_ITEMS.filter((item) => item.id === id));
}

/// Every item in its remembered order, hidden or not, for the settings page.
export function orderedTop(pref: TopPreference): (typeof TOP_ITEMS)[number][] {
  return visibleTop({ order: pref.order, hidden: [] });
}
