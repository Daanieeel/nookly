import {
  IconArchive,
  IconCalendar,
  IconInfoCircle,
  IconKeyboard,
  IconNotes,
  IconPalette,
  IconPlugConnected,
  IconRobot,
  IconSettings,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { SettingCategory } from "#/lib/settings/registry.ts";

/// The pages of the Settings dialog. A page is what the navigation lists; it is not the
/// same as a registry category, because the CLI and search group settings by category while
/// the dialog groups them by what someone is trying to do. Every setting keeps its id,
/// title and keywords whichever page shows it.

export type PageId =
  | "general"
  | "appearance"
  | "editor"
  | "calendar"
  | "backup"
  | "connections"
  | "shortcuts"
  | "agent"
  | "about";

export interface PageDef {
  id: PageId;
  label: string;
  icon: TablerIcon;
}

export const PAGES = {
  general: { id: "general", label: "General", icon: IconSettings },
  appearance: { id: "appearance", label: "Appearance", icon: IconPalette },
  editor: { id: "editor", label: "Editor", icon: IconNotes },
  calendar: { id: "calendar", label: "Calendar", icon: IconCalendar },
  backup: { id: "backup", label: "Backup", icon: IconArchive },
  connections: { id: "connections", label: "Connections", icon: IconPlugConnected },
  shortcuts: { id: "shortcuts", label: "Shortcuts", icon: IconKeyboard },
  agent: { id: "agent", label: "Agent", icon: IconRobot },
  about: { id: "about", label: "About", icon: IconInfoCircle },
} satisfies Record<PageId, PageDef>;

/// A run of pages under a muted heading. A group without a label has no heading.
export interface NavGroup {
  label: string | null;
  pages: PageId[];
}

/// The navigation, top to bottom. About sits at the bottom with the settings file button.
export const NAV_GROUPS: NavGroup[] = [
  { label: null, pages: ["general", "appearance"] },
  { label: "Writing and study", pages: ["editor", "calendar"] },
  { label: "Data and accounts", pages: ["backup", "connections"] },
  { label: "Power tools", pages: ["shortcuts", "agent"] },
];

export const FOOTER_PAGES: PageId[] = ["about"];

const PAGE_OF_CATEGORY = {
  general: "general",
  appearance: "appearance",
  calendar: "calendar",
  notes: "editor",
  backup: "backup",
  agent: "agent",
  shortcuts: "shortcuts",
} satisfies Record<SettingCategory, PageId>;

/// Sections that sit on another page than their category's.
const PAGE_OF_SECTION = new Map<string, PageId>([
  ["calendar/Connections", "connections"],
  ["general/About", "about"],
]);

/// The page that shows a row, from its category and the heading it sits under.
export function pageOf(row: { category: SettingCategory; section: string }): PageId {
  return PAGE_OF_SECTION.get(`${row.category}/${row.section}`) ?? PAGE_OF_CATEGORY[row.category];
}

/// Every page in navigation order, for search results and tests.
export const PAGE_ORDER: PageId[] = [
  ...NAV_GROUPS.flatMap((group) => group.pages),
  ...FOOTER_PAGES,
];
