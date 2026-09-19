import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createExam, listExams } from "@/lib/api/exams";
import type { Entity } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";

export function ExamsListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState<Entity | null>(null);
  const [examDate, setExamDate] = useState("");

  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createExam(spaceId, title, course.id, examDate || null, null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", spaceId] });
      setTitle("");
      setExamDate("");
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Exams</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Exam title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 w-40"
        />
        <EntityPickerPopover
          spaceId={spaceId}
          typeFilter="course"
          trigger={
            <Button variant="outline" size="sm">
              {course ? course.title : "Pick course…"}
            </Button>
          }
          onSelect={setCourse}
        />
        <Input
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className="h-9 w-40"
        />
        <Button
          size="sm"
          disabled={!title.trim() || !course || create.isPending}
          onClick={() => create.mutate()}
        >
          Add exam
        </Button>
      </div>
      <div className="flex flex-col">
        {exams.map((exam) => (
          <button
            key={exam.entity.id}
            type="button"
            onClick={() => openEntity(exam.entity.id, spaceId)}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate">{exam.entity.title}</span>
            {exam.examDate && <Badge variant="outline">{exam.examDate}</Badge>}
            <Badge>{exam.status}</Badge>
          </button>
        ))}
        {exams.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No exams yet.</p>
        )}
      </div>
    </div>
  );
}
