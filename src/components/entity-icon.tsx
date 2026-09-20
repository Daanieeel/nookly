import {
  IconBookmark,
  IconCalendarStats,
  IconCards,
  IconChalkboard,
  IconChecklist,
  IconClipboardList,
  IconClock,
  IconFile,
  IconFileText,
  IconFolder,
  IconNotes,
  IconSchool,
  IconSparkles,
  IconWriting,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { Entity } from "@/lib/api/types";

const DEFAULT_ICONS = new Map<string, TablerIcon>([
  ["task", IconChecklist],
  ["sub_task", IconChecklist],
  ["note", IconFileText],
  ["jot", IconNotes],
  ["refinement", IconSparkles],
  ["course", IconSchool],
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
    return (
      <span
        className={cn(className, "text-(--icon-size) leading-none")}
        // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
        style={{ "--icon-size": `${size}px` } as CSSProperties}
      >
        {entity.icon}
      </span>
    );
  }
  const Icon = DEFAULT_ICONS.get(entity.type) ?? IconFile;
  return <Icon size={size} className={className} />;
}

export function iconForType(type: string): TablerIcon {
  return DEFAULT_ICONS.get(type) ?? IconFile;
}
