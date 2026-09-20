import { IconCalendarPlus, IconCalendarStats } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createExam, listExams } from "@/lib/api/exams";
import type { Entity, Exam } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

/// Date-forward, urgency-first (§2.3) — undated exams sink to the bottom, dated
/// ones sort soonest-first so the page reads as "what's coming up", not an
/// alphabetical/insertion-order list.
function sortByUrgency(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    if (!a.examDate && !b.examDate) return 0;
    if (!a.examDate) return 1;
    if (!b.examDate) return -1;
    return a.examDate.localeCompare(b.examDate);
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

/// A small proximity dot, not a recolored Badge — status color stays on the
/// Badge's own variant, urgency is a separate signal layered on the row.
function UrgencyDot({ examDate, status }: { examDate: string | null; status: string }) {
  const days = daysUntil(examDate);
  let className = "bg-muted-foreground/30";
  if (status !== "done" && days !== null) {
    if (days < 0) className = "bg-destructive";
    else if (days <= 7) className = "bg-warning";
  }
  return <span className={`size-1.5 shrink-0 rounded-full ${className}`} aria-hidden />;
}

function statusBadgeVariant(status: string): "positive" | "secondary" | "outline" {
  if (status === "done") return "positive";
  if (status === "studying") return "secondary";
  return "outline";
}

export function ExamsListView({ spaceId }: { spaceId: string }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });

  const sorted = sortByUrgency(exams);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Exams</h1>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <IconCalendarPlus size={14} /> New exam
        </Button>
      </div>

      <div className="flex flex-col">
        {sorted.map((exam) => (
          <button
            key={exam.entity.id}
            type="button"
            onClick={() => openEntity(exam.entity.id, spaceId)}
            className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
          >
            <UrgencyDot examDate={exam.examDate} status={exam.status} />
            <span className="min-w-0 flex-1 truncate">{displayTitle(exam.entity)}</span>
            {exam.examDate && (
              <span className="shrink-0 text-xs text-muted-foreground">{exam.examDate}</span>
            )}
            <Badge variant={statusBadgeVariant(exam.status)} className="shrink-0">
              {exam.status}
            </Badge>
          </button>
        ))}
        {sorted.length === 0 && (
          <EmptyState
            icon={IconCalendarStats}
            title="No exams yet"
            description="Add an exam to start building study decks for it."
            action={{ label: "New exam", onClick: () => setCreateOpen(true) }}
          />
        )}
      </div>

      <CreateExamDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateExamDialog({
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
  const [examDate, setExamDate] = useState("");

  const create = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createExam(spaceId, `${displayTitle(course)} Exam`, course.id, examDate || null, null);
    },
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ["exams", spaceId] });
      setCourse(null);
      setExamDate("");
      onOpenChange(false);
      openEntity(exam.entity.id, spaceId);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New exam</DialogTitle>
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
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="h-8"
          />
          <p className="text-xs text-muted-foreground">
            Grade, weight and status can be filled in afterward.
          </p>
        </div>
        <DialogFooter>
          <Button size="sm" disabled={!course || create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
