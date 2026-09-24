import { IconCalendarEvent, IconTagOff } from "@tabler/icons-react";
import type { GroupDef } from "@/components/grouped-view/grouping";
import { LabelDot } from "@/components/label-chip";
import type { Label, Task, TaskStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { DUE_BUCKETS, type Grouping, type StatusKind, dueBucket } from "./task-model";
import { TaskStatusIcon } from "./task-properties";

/// The groups a grouping splits tasks into, each with its header glyph. `null`
/// for no grouping.
export function taskGroupDefs(
  grouping: Grouping,
  statuses: TaskStatus[],
  labels: Label[],
  kindOf: (statusId: string) => StatusKind,
): GroupDef<Task>[] | null {
  switch (grouping) {
    case "status":
      return statuses.map((status) => ({
        id: status.id,
        name: status.name,
        icon: <TaskStatusIcon status={status} kind={kindOf(status.id)} />,
        match: (t) => t.statusId === status.id,
      }));
    case "label":
      // A task with two labels shows up under both, as in Linear.
      return [
        ...labels.map((label) => ({
          id: label.id,
          name: label.name,
          icon: (
            <span className="flex size-3.5 items-center justify-center">
              <LabelDot label={label} />
            </span>
          ),
          match: (t: Task) => t.labelIds.includes(label.id),
        })),
        {
          id: "no-label",
          name: "No label",
          icon: <IconTagOff size={14} className="text-muted-foreground" />,
          match: (t: Task) => t.labelIds.length === 0,
        },
      ];
    case "due":
      return DUE_BUCKETS.map((b) => ({
        id: b.id,
        name: b.label,
        icon: (
          <IconCalendarEvent
            size={14}
            className={cn(
              "text-muted-foreground",
              b.id === "overdue" && "text-destructive",
              b.id === "today" && "text-caution",
            )}
          />
        ),
        match: (t) => dueBucket(t.dueDate) === b.id,
      }));
    case "none":
      return null;
  }
}
