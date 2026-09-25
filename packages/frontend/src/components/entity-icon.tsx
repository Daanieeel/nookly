import {
  IconApple,
  IconBike,
  IconBook2,
  IconBookmark,
  IconBriefcase,
  IconBulb,
  IconCalendarStats,
  IconCards,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconClock,
  IconCode,
  IconCoffee,
  IconFeather,
  IconFile,
  IconFileText,
  IconFlag,
  IconFolder,
  IconHeart,
  IconHome,
  IconMusic,
  IconNotes,
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
  IconWriting,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { CSSProperties } from "react";
import { cn } from "@nookly/ui/lib/utils";
import type { Entity } from "#/lib/api/types.ts";

const DEFAULT_ICONS = new Map<string, TablerIcon>([
  ["task", IconChecklist],
  ["sub_task", IconChecklist],
  ["note", IconFileText],
  ["jot", IconFeather],
  ["course", IconSchool],
  ["course_notes", IconFileText],
  ["semester", IconCalendarStats],
  ["session", IconChalkboard],
  ["session_template", IconChalkboard],
  ["exam", IconWriting],
  ["index_card_deck", IconCards],
  ["study_block", IconClock],
  ["assignment", IconClipboardList],
  ["file", IconFile],
  ["bookmark", IconBookmark],
  ["space", IconFolder],
]);

/// Value prefix marking a stored `icon` string as a Tabler icon-library
/// selection (`icon:<name>`, name keyed into `ICON_LIBRARY`) rather than a
/// literal emoji glyph — the two share the same `icon: string | null` field.
const ICON_LIBRARY_PREFIX = "icon:";

/// Curated assortment offered by `IconPicker`'s "Icons" tab. Includes every
/// per-type default (so e.g. a Space's fallback Folder icon is explicitly
/// pickable/highlightable, not just an invisible fallback) plus a handful of
/// general-purpose extras.
export const ICON_LIBRARY = new Map<string, TablerIcon>([
  ["Folder", IconFolder],
  ["Book", IconBook2],
  ["School", IconSchool],
  ["Checklist", IconChecklist],
  ["Notes", IconNotes],
  ["Feather", IconFeather],
  ["FileText", IconFileText],
  ["Sparkles", IconSparkles],
  ["Chalkboard", IconChalkboard],
  ["Writing", IconWriting],
  ["Cards", IconCards],
  ["Clock", IconClock],
  ["ClipboardList", IconClipboardList],
  ["File", IconFile],
  ["Bookmark", IconBookmark],
  ["CalendarStats", IconCalendarStats],
  ["Star", IconStar],
  ["Heart", IconHeart],
  ["Flag", IconFlag],
  ["Target", IconTarget],
  ["Rocket", IconRocket],
  ["Bulb", IconBulb],
  ["Trophy", IconTrophy],
  ["Home", IconHome],
  ["Briefcase", IconBriefcase],
  ["Code", IconCode],
  ["Palette", IconPalette],
  ["Music", IconMusic],
  ["Coffee", IconCoffee],
  ["Apple", IconApple],
  ["Plant", IconPlant],
  ["Sun", IconSun],
  ["Plane", IconPlane],
  ["Bike", IconBike],
]);

export function isIconLibraryValue(value: string): boolean {
  return value.startsWith(ICON_LIBRARY_PREFIX);
}

export function iconLibraryValue(name: string): string {
  return `${ICON_LIBRARY_PREFIX}${name}`;
}

/// Renders a stored `icon` value, whichever kind it is — a Tabler icon-library
/// selection or a literal emoji. Shared by `EntityIcon` and any UI (e.g. the
/// Space icon triggers in the sidebar) that renders an icon value outside the
/// `Entity` shape. To tint an icon-library result (e.g. a Space's accent
/// color), wrap the call in a `text-(--your-var)` span rather than passing a
/// style through here — Tabler icons already draw with `currentColor`.
export function renderIconValue(value: string, size: number, className?: string) {
  if (isIconLibraryValue(value)) {
    const Icon = ICON_LIBRARY.get(value.slice(ICON_LIBRARY_PREFIX.length));
    if (Icon) return <Icon size={size} className={className} />;
  }
  return (
    <span
      className={cn(className, "text-(--icon-size) leading-none")}
      // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
      style={{ "--icon-size": `${size}px` } as CSSProperties}
    >
      {value}
    </span>
  );
}

export function EntityIcon({
  entity,
  className,
  size = 16,
}: {
  entity: Pick<Entity, "type" | "icon">;
  className?: string;
  size?: number;
}) {
  if (entity.icon) {
    return renderIconValue(entity.icon, size, className);
  }
  const Icon = DEFAULT_ICONS.get(entity.type) ?? IconFile;
  return <Icon size={size} className={className} />;
}

export function iconForType(type: string): TablerIcon {
  return DEFAULT_ICONS.get(type) ?? IconFile;
}
