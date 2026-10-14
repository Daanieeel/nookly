import type { ModuleKey } from "@nookly/shared/modules";
import { moduleForEntityType } from "@nookly/shared/modules";
import {
  IconBook2,
  IconBookmark,
  IconCalendarEvent,
  IconCalendarStats,
  IconCalendarWeek,
  IconCards,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconFeather,
  IconFile,
  IconNotes,
  IconReportAnalytics,
  IconToolsKitchen2,
  type Icon,
} from "@tabler/icons-react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// The same Tabler icon per module as on the desktop (`MODULE_ICONS`).
export const MODULE_ICONS = {
  tasks: IconChecklist,
  notes: IconNotes,
  jots: IconFeather,
  courses: IconBook2,
  semesters: IconCalendarWeek,
  sessions: IconChalkboard,
  calendar: IconCalendarEvent,
  exams: IconCalendarStats,
  decks: IconCards,
  assignments: IconClipboardList,
  files: IconFile,
  bookmarks: IconBookmark,
  recipes: IconToolsKitchen2,
  grades: IconReportAnalytics,
} satisfies Record<ModuleKey, Icon>;

/// An entity's own icon (an emoji) or its type's, in the neutral muted color.
export function EntityIcon({
  type,
  icon,
  size = 18,
}: {
  type: string;
  icon?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  if (icon && !icon.includes(":")) return <Text style={{ fontSize: size - 2 }}>{icon}</Text>;
  const module = moduleForEntityType(type);
  const Glyph = module ? MODULE_ICONS[module] : IconFile;
  return <Glyph size={size} color={theme.colors.mutedForeground} accessibilityElementsHidden />;
}
