import {
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { IconClipboardCheck, IconClipboardPlus, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createAssignment, listAssignments, updateAssignmentStatus } from "@/lib/api/assignments";
import { getEntity } from "@/lib/api/entities";
import { listRelationships } from "@/lib/api/relationships";
import type { Assignment, Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

const STATUSES = ["not_started", "in_progress", "submitted", "graded"];
const TERMINAL_STATUSES = new Set(["submitted", "graded"]);

/// Date-forward, urgency-first (§2.3) — same sorting/urgency treatment as Exams,
/// but visually distinct: no proximity dot on a Badge, a checklist-flavored icon,
/// and status shown inline as an editable Select (matching prior behavior) rather
/// than a read-only Badge, since Assignment status is the thing most often changed.
function sortByUrgency(assignments: Assignment[]): Assignment[] {
  return [...assignments].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function UrgencyDot({ dueDate, status }: { dueDate: string | null; status: string }) {
  const days = daysUntil(dueDate);
  let className = "bg-muted-foreground/30";
  if (!TERMINAL_STATUSES.has(status) && days !== null) {
    if (days < 0) className = "bg-destructive";
    else if (days <= 7) className = "bg-warning";
  }
  return <span className={`size-1.5 shrink-0 rounded-full ${className}`} aria-hidden />;
}

/// See `ExamsListView`'s equivalent doc comment for the `filterCourseId` convention.
export function AssignmentsListView({
  spaceId,
  filterCourseId,
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const setView = useNavStore((s) => s.setView);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  const { data: filterCourse } = useQuery({
    queryKey: ["entity", filterCourseId],
    queryFn: () => getEntity(filterCourseId as string),
    enabled: Boolean(filterCourseId),
  });
  const { data: courseRelationships = [] } = useQuery({
    queryKey: ["relationships", filterCourseId],
    queryFn: () => listRelationships(filterCourseId as string, "to"),
    enabled: Boolean(filterCourseId),
  });

  const setStatus = useMutation({
    mutationFn: (vars: { entityId: string; status: string }) =>
      updateAssignmentStatus(vars.entityId, vars.status, null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] }),
  });
  const failedId = setStatus.isError ? setStatus.variables?.entityId : undefined;

  const scoped = filterCourseId
    ? assignments.filter((a) =>
        courseRelationships.some(
          (r) => r.relationshipType === "assignment-course" && r.fromEntityId === a.entity.id,
        ),
      )
    : assignments;
  const sorted = sortByUrgency(scoped);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Assignments</h1>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <IconClipboardPlus size={14} /> New assignment
        </Button>
      </div>

      {filterCourseId && filterCourse && (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 pr-1">
            Filtered by {displayTitle(filterCourse)}
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setView({ kind: "module", spaceId, module: "assignments" })}
              className="rounded-full p-0.5 hover:bg-accent-foreground/10"
            >
              <IconX size={11} />
            </button>
          </Badge>
        </div>
      )}

      <div className="flex flex-col">
        {sorted.map((a) => (
          <div
            key={a.entity.id}
            className="flex items-center gap-2.5 rounded-sm px-2 py-2 hover:bg-accent"
          >
            <UrgencyDot dueDate={a.dueDate} status={a.status} />
            <button
              type="button"
              onClick={() => openEntity(a.entity.id, spaceId)}
              className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
            >
              {displayTitle(a.entity)}
            </button>
            {a.dueDate && (
              <span className="shrink-0 text-xs text-muted-foreground">{a.dueDate}</span>
            )}
            {failedId === a.entity.id && (
              <span
                role="alert"
                className="flex shrink-0 items-center gap-1 text-xs text-destructive"
              >
                <StatusIcon status="error" idle={null} size={13} />
                Couldn't change status
              </span>
            )}
            <Select
              value={a.status}
              onValueChange={(status) => setStatus.mutate({ entityId: a.entity.id, status })}
            >
              <SelectTrigger size="sm" className="w-36 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {sorted.length === 0 && (
          <EmptyState
            icon={IconClipboardCheck}
            title="No assignments yet"
            description="Track due dates, grades, and progress as you go."
            action={{ label: "New assignment", onClick: () => setCreateOpen(true) }}
          />
        )}
      </div>

      <CreateAssignmentDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateAssignmentDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [course, setCourse] = useState<Entity | null>(null);
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createAssignment(
        spaceId,
        `${displayTitle(course)} Assignment`,
        course.id,
        dueDate || null,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] }),
  });
  const createStatus = statusOf(create);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setCourse(null);
      setDueDate("");
      create.reset();
    }
  }

  useCloseAfterSuccess(create, () => {
    const created = create.data;
    handleOpenChange(false);
    if (created) openEntity(created.entity.id, spaceId);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="course"
            trigger={
              <Button variant="secondary" size="sm" className="w-full justify-start">
                {course ? displayTitle(course) : "Pick a course…"}
              </Button>
            }
            onSelect={setCourse}
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-8"
          />
          <p className="text-xs text-muted-foreground">
            Status and grade can be filled in afterward.
          </p>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={!course}
            onClick={() => (createStatus === "idle" || createStatus === "error") && create.mutate()}
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
