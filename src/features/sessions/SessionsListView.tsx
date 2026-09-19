import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSessionTemplate,
  generateOccurrences,
  listSessions,
  overrideOccurrence,
} from "@/lib/api/sessions";
import type { Entity } from "@/lib/api/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SessionsListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const [course, setCourse] = useState<Entity | null>(null);
  const [title, setTitle] = useState("");
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [anchorDate, setAnchorDate] = useState("");
  const [untilDate, setUntilDate] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
  });

  const createTemplate = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createSessionTemplate(
        spaceId,
        title,
        course.id,
        weekday,
        startTime,
        endTime,
        null,
        anchorDate,
      );
    },
    onSuccess: async (template) => {
      if (untilDate) {
        await generateOccurrences(template.id, untilDate);
      }
      queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] });
      setTitle("");
    },
  });

  const cancelOccurrence = useMutation({
    mutationFn: (entityId: string) => overrideOccurrence(entityId, { cancelled: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="text-lg font-semibold">Sessions</h1>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">New weekly lecture</h2>
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
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-accent px-2 text-sm"
          >
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={i}>
                {day}
              </option>
            ))}
          </select>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-9 w-28"
          />
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-9 w-28"
          />
          <Input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            title="First occurrence date"
            className="h-9 w-40"
          />
          <Input
            type="date"
            value={untilDate}
            onChange={(e) => setUntilDate(e.target.value)}
            title="Generate occurrences until"
            className="h-9 w-40"
          />
          <Button
            size="sm"
            disabled={!title.trim() || !course || !anchorDate || createTemplate.isPending}
            onClick={() => createTemplate.mutate()}
          >
            Create + generate
          </Button>
        </div>
      </div>

      <div className="flex flex-col">
        {sessions.map((s) => (
          <div
            key={s.entity.id}
            className={`flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${s.cancelled ? "opacity-50" : ""}`}
          >
            <span className="w-24 shrink-0 text-muted-foreground">{s.date}</span>
            <span className="w-28 shrink-0 text-muted-foreground">
              {s.startTime}–{s.endTime}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.entity.title}</span>
            {s.cancelled ? (
              <span className="text-xs text-destructive">Cancelled</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelOccurrence.mutate(s.entity.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No sessions yet.</p>
        )}
      </div>
    </div>
  );
}
