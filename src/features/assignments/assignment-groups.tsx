import {
  IconAlertCircle,
  IconCalendarDot,
  IconCalendarMonth,
  IconCalendarOff,
  IconCalendarWeek,
  IconCircleCheck,
  IconClockPlus,
  IconHistory,
  IconSchool,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { GroupDef } from "@/components/grouped-view/grouping";
import { TaskStatusIcon } from "@/features/tasks/task-properties";
import type { Assignment, Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import {
  ASSIGNMENT_STATUSES,
  type BucketDef,
  CREATED_BUCKETS,
  DEADLINE_BUCKETS,
  type Grouping,
  type Tone,
  createdBucket,
  deadlineBucket,
  statusKindOf,
} from "./assignment-model";

const TONE_TEXT = {
  destructive: "text-destructive",
  caution: "text-caution",
  positive: "text-positive",
  muted: "text-muted-foreground",
} satisfies Record<Tone, string>;

const DEADLINE_ICON = new Map<string, TablerIcon>([
  ["overdue", IconAlertCircle],
  ["today", IconCalendarDot],
  ["week", IconCalendarWeek],
  ["next", IconCalendarWeek],
  ["later", IconCalendarMonth],
  ["none", IconCalendarOff],
  ["done", IconCircleCheck],
]);

function bucketDefs(
  buckets: BucketDef[],
  bucketOf: (a: Assignment) => string,
  iconFor: (id: string) => TablerIcon,
): GroupDef<Assignment>[] {
  return buckets.map((b) => {
    const Icon = iconFor(b.id);
    return {
      id: b.id,
      name: b.label,
      icon: <Icon size={14} className={TONE_TEXT[b.tone]} />,
      defaultCollapsed: b.collapsed,
      match: (a) => bucketOf(a) === b.id,
    };
  });
}

/// The groups a grouping splits assignments into, each with its header glyph.
/// `null` for no grouping.
export function assignmentGroupDefs(
  grouping: Grouping,
  courses: Entity[],
  courseOf: Map<string, Entity>,
): GroupDef<Assignment>[] | null {
  const now = new Date();
  switch (grouping) {
    case "deadline":
      return bucketDefs(
        DEADLINE_BUCKETS,
        (a) => deadlineBucket(a, now),
        (id) => DEADLINE_ICON.get(id) ?? IconCalendarMonth,
      );
    case "created":
      return bucketDefs(
        CREATED_BUCKETS,
        (a) => createdBucket(a, now),
        (id) => (id === "today" || id === "week" ? IconClockPlus : IconHistory),
      );
    case "status":
      return ASSIGNMENT_STATUSES.map((status) => ({
        id: status.id,
        name: status.name,
        icon: <TaskStatusIcon status={status} kind={statusKindOf(status.id)} />,
        match: (a) => a.status === status.id,
      }));
    case "course":
      return [
        ...courses.map((course) => ({
          id: course.id,
          name: displayTitle(course),
          icon: <IconSchool size={14} className="text-muted-foreground" />,
          match: (a: Assignment) => courseOf.get(a.entity.id)?.id === course.id,
        })),
        {
          id: "no-course",
          name: "No course",
          icon: <IconSchool size={14} className="text-muted-foreground/50" />,
          match: (a: Assignment) => !courseOf.has(a.entity.id),
        },
      ];
    case "none":
      return null;
  }
}
