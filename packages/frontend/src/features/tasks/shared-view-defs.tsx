import { IconClockEdit, IconClockPlus, IconFolder } from "@tabler/icons-react";
import type { FilterField } from "#/components/filter-menu.tsx";
import type { GroupDef } from "#/components/grouped-view/grouping.ts";
import { SpaceDot } from "#/components/space-chip.tsx";
import type { Space } from "#/lib/api/types.ts";
import { AGE_BUCKETS, ageBucket } from "#/features/assignments/assignment-model.ts";

/// Filter fields and group defs the Tasks and Assignments pages have in common.

export function spaceFilterField(spaces: Space[]): FilterField {
  return {
    id: "space",
    label: "Space",
    icon: IconFolder,
    options: spaces.map((space) => ({
      value: space.id,
      label: space.name,
      icon: <SpaceDot space={space} />,
    })),
  };
}

export const CREATED_FILTER_FIELD: FilterField = {
  id: "created",
  label: "Created",
  icon: IconClockPlus,
  options: AGE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
};

export const UPDATED_FILTER_FIELD: FilterField = {
  id: "updated",
  label: "Updated",
  icon: IconClockEdit,
  options: AGE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
};

/// One group per Space.
export function spaceGroupDefs<T>(spaces: Space[], spaceIdOf: (item: T) => string): GroupDef<T>[] {
  return spaces.map((space) => ({
    id: space.id,
    name: space.name,
    icon: (
      <span className="flex size-3.5 items-center justify-center">
        <SpaceDot space={space} />
      </span>
    ),
    match: (item: T) => spaceIdOf(item) === space.id,
  }));
}

/// One group per age bucket of a timestamp: today, this week, last week, earlier.
export function ageGroupDefs<T>(
  timestamp: (item: T) => string,
  Icon: typeof IconClockPlus,
  now?: Date,
): GroupDef<T>[] {
  return AGE_BUCKETS.map((b) => ({
    id: b.id,
    name: b.label,
    icon: <Icon size={14} className="text-muted-foreground" />,
    match: (item: T) => ageBucket(timestamp(item), now) === b.id,
  }));
}

/// Created and Updated, as a pair that sits together in every filter list.
export const AGE_FILTER_FIELDS: FilterField[] = [CREATED_FILTER_FIELD, UPDATED_FILTER_FIELD];
