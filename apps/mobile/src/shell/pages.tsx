import type { ComponentType } from "react";
import type { Route } from "expo-router/react-navigation";
import { z } from "zod";
import Assignments from "../app/assignments.tsx";
import Conflicts from "../app/conflicts.tsx";
import Calendar from "../app/(drawer)/calendar.tsx";
import Dashboard from "../app/(drawer)/index.tsx";
import Module from "../app/(drawer)/module/[spaceId]/[module].tsx";
import Pinned from "../app/(drawer)/pinned.tsx";
import Search from "../app/(drawer)/search.tsx";
import Space from "../app/(drawer)/space/[id].tsx";
import Tasks from "../app/(drawer)/tasks.tsx";
import Trash from "../app/(drawer)/trash.tsx";
import Entity from "../app/entity/[id].tsx";
import File from "../app/file/[id].tsx";
import MoodleCourse from "../app/moodle/[courseId].tsx";
import MoodleAssignment from "../app/moodle/assignment/[id].tsx";
import MoodleDiscussion from "../app/moodle/discussion/[id].tsx";
import MoodleFile from "../app/moodle/file.tsx";
import MoodleForum from "../app/moodle/forum/[id].tsx";
import MoodlePage from "../app/moodle/page/[cmid].tsx";
import SettingsPage from "../app/settings/[page].tsx";
import CalendarConnections from "../app/settings/calendar-connections.tsx";
import Settings from "../app/settings/index.tsx";
import Shortcuts from "../app/settings/shortcuts.tsx";
import SidebarSettings from "../app/settings/sidebar.tsx";
import WhatsNew from "../app/settings/whats-new.tsx";

/// What sort of page a path is: a list an item is picked from (an item then opens beside
/// it, 1.6), an item, or any other page.
export type PageKind = "list" | "item" | "page";

interface PageRoute {
  /// The route's file, as `app/` names it (`entity/[id]`).
  pattern: string;
  Component: ComponentType;
  kind: PageKind;
}

/// Every route the tablet shows as a page in a tab, by the same route files the phone's
/// stack shows. Create forms, pickers, the welcome, signing in, a Space's settings and a
/// study session are not pages: they stay the router's, over the window.
const ROUTES: PageRoute[] = [
  { pattern: "", Component: Dashboard, kind: "list" },
  { pattern: "calendar", Component: Calendar, kind: "page" },
  { pattern: "tasks", Component: Tasks, kind: "list" },
  { pattern: "pinned", Component: Pinned, kind: "list" },
  { pattern: "search", Component: Search, kind: "list" },
  { pattern: "trash", Component: Trash, kind: "list" },
  { pattern: "assignments", Component: Assignments, kind: "list" },
  { pattern: "space/[id]", Component: Space, kind: "list" },
  { pattern: "module/[spaceId]/[module]", Component: Module, kind: "list" },
  { pattern: "entity/[id]", Component: Entity, kind: "item" },
  { pattern: "file/[id]", Component: File, kind: "item" },
  { pattern: "conflicts", Component: Conflicts, kind: "page" },
  { pattern: "settings", Component: Settings, kind: "page" },
  { pattern: "settings/calendar-connections", Component: CalendarConnections, kind: "page" },
  { pattern: "settings/shortcuts", Component: Shortcuts, kind: "page" },
  { pattern: "settings/sidebar", Component: SidebarSettings, kind: "page" },
  { pattern: "settings/whats-new", Component: WhatsNew, kind: "page" },
  { pattern: "settings/[page]", Component: SettingsPage, kind: "page" },
  { pattern: "moodle/assignment/[id]", Component: MoodleAssignment, kind: "page" },
  { pattern: "moodle/forum/[id]", Component: MoodleForum, kind: "page" },
  { pattern: "moodle/discussion/[id]", Component: MoodleDiscussion, kind: "page" },
  { pattern: "moodle/page/[cmid]", Component: MoodlePage, kind: "page" },
  { pattern: "moodle/file", Component: MoodleFile, kind: "page" },
  { pattern: "moodle/[courseId]", Component: MoodleCourse, kind: "list" },
];

export interface PageMatch {
  pattern: string;
  Component: ComponentType;
  kind: PageKind;
  /// The route's own parameters and the query's, as `useLocalSearchParams` gives them.
  params: Record<string, string>;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/// A route's params as the router keeps them: plain values, lists, or the params of a
/// route inside it (`params`).
export const RouteParamsSchema = z.record(z.string(), z.json());
export type RouteParams = z.infer<typeof RouteParamsSchema>;
const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/// A route's params from the router: what the router keeps is plain data (it saves it),
/// so a copy through JSON drops what is not (an undefined value) and parses.
export function parseRouteParams(raw: Route<string>["params"]): RouteParams {
  return RouteParamsSchema.safeParse(JSON.parse(JSON.stringify(raw ?? {}))).data ?? {};
}

/// The parts of a path: its segments and its query.
export function splitPath(path: string) {
  const [pathname = "", search = ""] = path.split("?");
  const segments = pathname.split("/").filter(Boolean).map(decode);
  const query: Record<string, string> = {};
  for (const pair of search.split("&")) {
    if (!pair) continue;
    const [key, value = ""] = pair.split("=");
    query[decode(key)] = decode(value);
  }
  return { segments, query };
}

/// The page a path shows on a tablet, or null when it is not a page (a sheet, a modal).
export function matchPage(path: string): PageMatch | null {
  const { segments, query } = splitPath(path);
  for (const route of ROUTES) {
    const parts = route.pattern.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params = { ...query };
    const fits = parts.every((part, i) => {
      const dynamic = /^\[(\w+)\]$/.exec(part)?.[1];
      if (dynamic) {
        params[dynamic] = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (fits) return { ...route, params };
  }
  return null;
}

/// A path built from a route's name and params, as the router reports a page it shows:
/// the route's own params fill its segments, the rest become the query.
export function pathOf(routeName: string, params: RouteParams = {}): string {
  const used = new Set<string>();
  const pathname = routeName
    .split("/")
    // Groups (`(drawer)`), the router's own root (`__root`) and index files name no segment.
    .filter((part) => part && !/^\(.*\)$|^__/.test(part) && part !== "index" && part !== "_layout")
    .map((part) => {
      const dynamic = /^\[(\w+)\]$/.exec(part)?.[1];
      if (!dynamic) return part;
      used.add(dynamic);
      return encodeURIComponent(String(params[dynamic] ?? ""));
    })
    .join("/");
  const query = Object.entries(params)
    .flatMap(([key, value]) => {
      const scalar = Scalar.safeParse(value);
      return !used.has(key) && scalar.success
        ? [`${encodeURIComponent(key)}=${encodeURIComponent(String(scalar.data))}`]
        : [];
    })
    .join("&");
  return `/${pathname}${query ? `?${query}` : ""}`;
}
