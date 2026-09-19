import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAssignment, listAssignments, updateAssignmentStatus } from "@/lib/api/assignments";
import type { Entity } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";

const STATUSES = ["not_started", "in_progress", "submitted", "graded"];

export function AssignmentsListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState<Entity | null>(null);
  const [dueDate, setDueDate] = useState("");

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createAssignment(spaceId, title, course.id, dueDate || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] });
      setTitle("");
      setDueDate("");
    },
  });
  const setStatus = useMutation({
    mutationFn: (vars: { entityId: string; status: string }) =>
      updateAssignmentStatus(vars.entityId, vars.status, null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Assignments</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Title"
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
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-9 w-40"
        />
        <Button
          size="sm"
          disabled={!title.trim() || !course || create.isPending}
          onClick={() => create.mutate()}
        >
          Add
        </Button>
      </div>
      <div className="flex flex-col">
        {assignments.map((a) => (
          <div
            key={a.entity.id}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
          >
            <button
              type="button"
              onClick={() => openEntity(a.entity.id, spaceId)}
              className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
            >
              {a.entity.title}
            </button>
            {a.dueDate && <Badge variant="outline">{a.dueDate}</Badge>}
            <Select
              value={a.status}
              onValueChange={(status) => setStatus.mutate({ entityId: a.entity.id, status })}
            >
              <SelectTrigger size="sm" className="w-36">
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
        {assignments.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No assignments yet.</p>
        )}
      </div>
    </div>
  );
}
