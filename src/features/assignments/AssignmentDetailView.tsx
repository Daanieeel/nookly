import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FieldError } from "@/components/action-feedback";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAssignments, updateAssignmentStatus } from "@/lib/api/assignments";
import type { Entity } from "@/lib/api/types";

const STATUSES = ["not_started", "in_progress", "submitted", "graded"];

/// Assignment ↔ Course is structural (§5.8) but delegates Todos/Notes entirely to
/// Relationships — this detail view owns only the Assignment's own native fields
/// (status, grade), the same split ExamDetailView uses for its own status/grade.
export function AssignmentDetailView({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", entity.spaceId],
    queryFn: () => listAssignments(entity.spaceId),
  });
  const assignment = assignments.find((a) => a.entity.id === entity.id);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["assignments", entity.spaceId] });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      updateAssignmentStatus(entity.id, status, assignment?.grade ?? null),
    onSuccess: invalidate,
  });
  const setGrade = useMutation({
    mutationFn: (grade: number) =>
      updateAssignmentStatus(entity.id, assignment?.status ?? "not_started", grade),
    onSuccess: invalidate,
  });

  return (
    <EntityDetailLayout entity={entity}>
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Select value={assignment?.status} onValueChange={(v) => setStatus.mutate(v)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Grade"
            defaultValue={assignment?.grade ?? ""}
            onBlur={(e) => e.target.value && setGrade.mutate(Number(e.target.value))}
            aria-invalid={setGrade.isError || undefined}
            className="h-8 w-24"
          />
        </div>
        <FieldError message={setStatus.isError && "Couldn't change status, pick it again"} />
        <FieldError message={setGrade.isError && "Couldn't save the grade, try again"} />
        {assignment?.dueDate && (
          <p className="text-xs text-muted-foreground">Due {assignment.dueDate}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Related Todos and Notes live in the panel on the right →
        </p>
      </div>
    </EntityDetailLayout>
  );
}
