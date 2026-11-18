import type { ModuleKey } from "@nookly/shared/modules";
import { moduleForEntityType } from "@nookly/shared/modules";
import {
  ICON_LIBRARY_NAMES,
  type IconLibraryName,
  isIconLibraryValue,
  parseIconLibraryValue,
} from "@nookly/shared/icons";
import {
  IconApple,
  IconBike,
  IconBook2,
  IconBriefcase,
  IconBulb,
  IconCode,
  IconCoffee,
  IconFlag,
  IconFolder,
  IconHeart,
  IconHome,
  IconMusic,
  IconPalette,
  IconPlane,
  IconPlant,
  IconRocket,
  IconSchool,
  IconSparkles,
  IconStar,
  IconSun,
  IconTarget,
  IconTrophy,
  IconClock,
  IconWriting,
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
  IconFileText,
  IconNotes,
  IconReportAnalytics,
  IconToolsKitchen2,
  type Icon,
} from "@tabler/icons-react-native";
import { Text as NativeText, View } from "react-native";
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
  moodle: IconSchool,
} satisfies Record<ModuleKey, Icon>;

/// The icon library's names, drawn with the same Tabler icons as on the desktop.
export const ICON_LIBRARY = {
  Folder: IconFolder,
  Book: IconBook2,
  School: IconSchool,
  Checklist: IconChecklist,
  Notes: IconNotes,
  Feather: IconFeather,
  FileText: IconFileText,
  Sparkles: IconSparkles,
  Chalkboard: IconChalkboard,
  Writing: IconWriting,
  Cards: IconCards,
  Clock: IconClock,
  ClipboardList: IconClipboardList,
  File: IconFile,
  Bookmark: IconBookmark,
  Kitchen: IconToolsKitchen2,
  CalendarStats: IconCalendarStats,
  Star: IconStar,
  Heart: IconHeart,
  Flag: IconFlag,
  Target: IconTarget,
  Rocket: IconRocket,
  Bulb: IconBulb,
  Trophy: IconTrophy,
  Home: IconHome,
  Briefcase: IconBriefcase,
  Code: IconCode,
  Palette: IconPalette,
  Music: IconMusic,
  Coffee: IconCoffee,
  Apple: IconApple,
  Plant: IconPlant,
  Sun: IconSun,
  Plane: IconPlane,
  Bike: IconBike,
} satisfies Record<IconLibraryName, Icon>;

/// A stored `icon` value drawn: a library pick (tinted if it says so) or an emoji.
/// `fallback` is the color of an untinted library icon.
export function IconValue({
  value,
  size = 18,
  fallback,
}: {
  value: string;
  size?: number;
  fallback: string;
}) {
  if (isIconLibraryValue(value)) {
    const { name, color } = parseIconLibraryValue(value);
    const known = ICON_LIBRARY_NAMES.find((n) => n === name);
    const Glyph = known ? ICON_LIBRARY[known] : null;
    if (Glyph) return <Glyph size={size} color={color ?? fallback} accessibilityElementsHidden />;
  }
  // An emoji is taller than its font size: a line of its own height centred in the square
  // keeps it from shifting up and being clipped at the top.
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityElementsHidden
    >
      <NativeText
        allowFontScaling={false}
        style={{
          fontSize: size - 2,
          lineHeight: Math.ceil(size * 1.25),
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {value}
      </NativeText>
    </View>
  );
}

/// An entity's own icon (an emoji or a library pick) or its type's, in the neutral
/// muted color.
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
  if (icon) return <IconValue value={icon} size={size} fallback={theme.colors.mutedForeground} />;
  const module = moduleForEntityType(type);
  const Glyph = module ? MODULE_ICONS[module] : IconFile;
  return <Glyph size={size} color={theme.colors.mutedForeground} accessibilityElementsHidden />;
}
