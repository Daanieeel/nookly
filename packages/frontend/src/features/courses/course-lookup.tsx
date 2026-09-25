import { IconArrowUpRight, IconSchool } from "@tabler/icons-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { StatusIcon } from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { PROPERTY_VALUE } from "#/components/property-row.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { listCourses } from "#/lib/api/courses.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";

/// The Course each entity belongs to through `relationshipType` (like
/// `assignment-course`), keyed by the entity's id. Shares the per Course
/// `["relationships", id]` cache `CoursesListView` already fills.
export function useCourseLookup(spaceId: string, relationshipType: string) {
  const { data: courses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
  const relQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["relationships", course.id],
      queryFn: () => listRelationships(course.id, "both"),
    })),
  });

  const courseOf = new Map<string, Entity>();
  courses.forEach((course, i) => {
    for (const r of relQueries[i]?.data ?? []) {
      if (r.relationshipType === relationshipType && r.toEntityId === course.id) {
        courseOf.set(r.fromEntityId, course);
      }
    }
  });
  return { courses, courseOf };
}

/// A quiet, read only chip naming a Course.
export function CourseChip({ course, className }: { course: Entity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-40 min-w-0 shrink-0 items-center gap-1.5 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <IconSchool size={12} className="shrink-0" />
      <span className="truncate">{displayTitle(course)}</span>
    </span>
  );
}

/// A Course chip that opens the Course on click.
export function CourseChipLink({
  course,
  onOpen,
  className,
}: {
  course: Entity;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Open Course ${displayTitle(course)}`}
          onClick={onOpen}
          className={cn(
            "inline-flex h-6 max-w-40 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <IconSchool size={12} className="shrink-0" />
          <span className="truncate">{displayTitle(course)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Open Course</TooltipContent>
    </Tooltip>
  );
}

/// A detail sidebar's Course property as a picker, like Linear's project field;
/// the arrow beside it opens the Course. Things with a Course keep exactly one,
/// so there is no "none".
export function CoursePickerField({
  spaceId,
  course,
  onChange,
  pending,
  failed,
}: {
  spaceId: string;
  course: Entity | undefined;
  onChange: (courseId: string) => void;
  pending: boolean;
  failed: boolean;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  return (
    <div className="group/course flex items-center gap-0.5">
      <EntityPickerPopover
        spaceId={spaceId}
        typeFilter="course"
        exclude={course?.id}
        onSelect={(next) => onChange(next.id)}
        trigger={
          <button
            type="button"
            aria-label={failed ? "Couldn't change the course, try again" : "Change Course"}
            className={PROPERTY_VALUE}
          >
            <StatusIcon
              status={pending ? "pending" : failed ? "error" : "idle"}
              idle={<IconSchool size={14} className="shrink-0 text-muted-foreground" />}
            />
            {course ? (
              <span className="truncate">{displayTitle(course)}</span>
            ) : (
              <span className="text-muted-foreground">Pick a course</span>
            )}
          </button>
        }
      />
      {course && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Open Course ${displayTitle(course)}`}
              onClick={() => openEntity(course.id, course.spaceId)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/course:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
            >
              <IconArrowUpRight size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Open Course</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
