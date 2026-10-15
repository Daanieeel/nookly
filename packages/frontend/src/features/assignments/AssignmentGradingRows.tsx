import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NumberProperty } from "#/components/property-fields.tsx";
import { PROPERTY_VALUE, PropertyRow } from "#/components/property-row.tsx";
import { PendingIcon } from "#/features/tasks/task-properties.tsx";
import { updateAssignmentStatus, updateAssignmentUngraded } from "#/lib/api/assignments.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { cn } from "@nookly/ui/lib/utils";
import { EvaluationToggle } from "./EvaluationToggle";

/// The Evaluation property, Ungraded (the default) or Graded, and under Graded the Grade
/// field. Going back to Ungraded hides the grade but keeps it.
export function AssignmentGradingRows({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qk.assignments.bySpace(assignment.entity.spaceId) });
  const setUngraded = useMutation({
    mutationFn: (ungraded: boolean) => updateAssignmentUngraded(assignment.entity.id, ungraded),
    onSuccess: invalidate,
  });
  const saveGrade = useMutation({
    mutationFn: (grade: number | null) =>
      updateAssignmentStatus(assignment.entity.id, assignment.status, grade),
    onSuccess: invalidate,
  });
  return (
    <>
      <PropertyRow label="Evaluation">
        <div className="flex items-center gap-1 pr-2">
          <EvaluationToggle
            ungraded={assignment.ungraded}
            onToggle={(ungraded) => setUngraded.mutate(ungraded)}
            className={cn(PROPERTY_VALUE, "gap-1.5")}
          />
          <PendingIcon pending={setUngraded.isPending} failed={setUngraded.isError} idle={null} />
        </div>
      </PropertyRow>
      {!assignment.ungraded && (
        <PropertyRow label="Grade">
          <NumberProperty
            value={assignment.grade}
            onSave={(grade) => saveGrade.mutate(grade)}
            addLabel="Add grade"
            clearLabel="Remove Grade"
            min={0}
            pending={saveGrade.isPending}
            failed={saveGrade.isError}
          />
        </PropertyRow>
      )}
    </>
  );
}
