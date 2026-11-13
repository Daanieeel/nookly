import type { FixedStatus } from "@nookly/shared/colors";
import type {
  CourseRecord,
  EntityRecord,
  ExamRecord,
  LabelRecord,
  Space,
} from "@nookly/shared/data";
import { moduleForEntityType } from "@nookly/shared/modules";
import { View } from "react-native";
import { IconValue } from "../ui/icons.tsx";
import { MODULE_BADGES } from "../ui/kit/badges.ts";
import { BADGE, TINT } from "../ui/tokens.ts";
import { dayLabel, localDay } from "./dates.ts";
import type { Option } from "../ui/sheet/OptionList.tsx";
import { SpaceIcon } from "./SpaceIcon.tsx";
import { StatusIcon } from "./TaskRow.tsx";

/// The options of a picker for things that carry their own colour, each on a badge tinted
/// with it, as iOS tints a Settings row's square (D50): a status, a label, a Space.

export function statusOption(status: FixedStatus): Option {
  return {
    id: status.id,
    label: status.name,
    icon: <StatusIcon status={status} size={BADGE.icon} />,
    tint: status.color,
  };
}

export function labelOption(label: LabelRecord): Option {
  return {
    id: label.id,
    label: label.name,
    icon: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: label.color }} />,
    tint: label.color,
  };
}

export function spaceOption(space: Space): Option {
  return {
    id: space.id,
    label: space.name,
    icon: <SpaceIcon space={space} size={BADGE.icon} />,
    tint: space.color,
  };
}

/// An item to link or open: its module's badge (or its own icon), its key under the title.
export function entityOption(entity: EntityRecord): Option {
  const module = moduleForEntityType(entity.type);
  const look = module ? MODULE_BADGES[module] : null;
  return {
    id: entity.id,
    label: entity.title || "Untitled",
    subtitle: entity.key || undefined,
    ...(entity.icon
      ? { icon: <IconValue value={entity.icon} size={BADGE.icon} fallback={TINT.gray.dark} /> }
      : look
        ? { glyph: look.glyph }
        : {}),
    tint: look?.tint ?? "gray",
  };
}

/// A Course, with its professor under the name as the desktop lists it.
export function courseOption(course: CourseRecord): Option {
  return {
    ...entityOption(course.entity),
    subtitle: course.professor ?? undefined,
  };
}

/// An Exam, with the day it is written on at the row's end.
export function examOption(exam: ExamRecord, today = localDay()): Option {
  return {
    ...entityOption(exam.entity),
    subtitle: undefined,
    detail: exam.examDate ? dayLabel(exam.examDate.slice(0, 10), today) : undefined,
  };
}
