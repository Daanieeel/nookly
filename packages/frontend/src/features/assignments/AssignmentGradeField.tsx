import { IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@nookly/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { NumberProperty } from "#/components/property-fields.tsx";
import { PROPERTY_VALUE } from "#/components/property-row.tsx";
import { PendingIcon } from "#/features/tasks/task-properties.tsx";
import { updateAssignmentStatus, updateAssignmentUngraded } from "#/lib/api/assignments.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";

/// An assignment's grade: a number, or None for work that is not graded at all, like
/// homework, which then takes no share of the course's grade.
export function AssignmentGradeField({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qk.assignments.bySpace(assignment.entity.spaceId) });
  const save = useMutation({
    mutationFn: (grade: number | null) =>
      updateAssignmentStatus(assignment.entity.id, assignment.status, grade),
    onSuccess: invalidate,
  });
  const setUngraded = useMutation({
    mutationFn: (ungraded: boolean) => updateAssignmentUngraded(assignment.entity.id, ungraded),
    onSuccess: invalidate,
  });

  if (assignment.ungraded) {
    return (
      <div className="flex items-center gap-1 pr-1">
        <span className="flex h-7 min-w-0 flex-1 items-center px-2 text-sm">None</span>
        <PendingIcon pending={setUngraded.isPending} failed={setUngraded.isError} idle={null} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Count towards grade"
              onClick={() => setUngraded.mutate(false)}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <IconX size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Count towards grade</TooltipContent>
        </Tooltip>
      </div>
    );
  }
  return (
    <NumberProperty
      value={assignment.grade}
      onSave={(grade) => save.mutate(grade)}
      addLabel="Add grade"
      clearLabel="Remove Grade"
      min={0}
      pending={save.isPending}
      failed={save.isError}
      alternative={
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setUngraded.mutate(true)}
              className={cn(PROPERTY_VALUE, "w-auto shrink-0 text-muted-foreground")}
            >
              None
            </button>
          </TooltipTrigger>
          <TooltipContent>Not graded, like homework</TooltipContent>
        </Tooltip>
      }
    />
  );
}
