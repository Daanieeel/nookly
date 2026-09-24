import { IconSchool } from "@tabler/icons-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listCourses } from "@/lib/api/courses";
import { listRelationships } from "@/lib/api/relationships";
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";

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
