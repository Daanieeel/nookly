import { IconClockEdit, IconClockPlus, IconFolder, IconPin } from "@tabler/icons-react";
import type { FilterField } from "#/components/filter-menu.tsx";
import type { GroupDef } from "#/components/grouped-view/grouping.ts";
import { SpaceDot } from "#/components/space-chip.tsx";
import type { Entity, Space } from "#/lib/api/types.ts";
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

export const PINNED_FILTER_FIELD: FilterField = {
  id: "pinned",
  label: "Pinned",
  icon: IconPin,
  options: [
    { value: "pinned", label: "Pinned" },
    { value: "unpinned", label: "Not pinned" },
  ],
};

/// Pinned, Created and Updated: every item has them, so every list can filter on them.
export const ENTITY_FILTER_FIELDS: FilterField[] = [PINNED_FILTER_FIELD, ...AGE_FILTER_FIELDS];

/// An item's value for Pinned, Created or Updated; undefined for any other field.
export function entityFilterValue(
  entity: Entity,
  fieldId: string,
  now = new Date(),
): string | undefined {
  if (fieldId === "pinned") return entity.pinned ? "pinned" : "unpinned";
  if (fieldId === "created") return ageBucket(entity.createdAt, now);
  if (fieldId === "updated") return ageBucket(entity.updatedAt, now);
  return undefined;
}
