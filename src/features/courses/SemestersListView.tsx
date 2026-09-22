import { IconCalendarWeek, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createSemester, listSemesters, updateSemester } from "@/lib/api/courses";
import type { Semester } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { resolveActiveSemesterId } from "./current-semester";

/// The Semesters overview: name, term dates, and which one is "Active" —
/// managing terms, not browsing courses. Grouping Courses by Semester (with
/// the course grid underneath each) lives on the Courses page instead, so
/// that's not duplicated here.
export function SemestersListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });

  const create = useMutation({
    mutationFn: () => createSemester(spaceId, title.trim(), startDate || null, endDate || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] });
      setTitle("");
      setStartDate("");
      setEndDate("");
    },
  });

  const activeSemesterId = resolveActiveSemesterId(semesters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Semesters</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate();
          }}
          className="flex items-center gap-1.5"
        >
          <Input
            placeholder="e.g. WS 2026/27"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <Input
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <Input
            type="date"
            aria-label="End date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!title.trim()}>
            <IconPlus size={14} /> Add
          </Button>
        </form>
      </div>

      {semesters.length === 0 ? (
        <EmptyState
          icon={IconCalendarWeek}
          title="No semesters yet"
          description="Add a semester or term above — Courses can then be grouped under it from the Courses page."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {semesters.map((semester) => (
            <SemesterRow
              key={semester.entity.id}
              semester={semester}
              active={semester.entity.id === activeSemesterId}
              spaceId={spaceId}
              onOpen={() => openEntity(semester.entity.id, spaceId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/// The two-date form reused both for creating a Semester and for backfilling
/// dates on one that predates this feature.
function DateRangeForm({
  startDate,
  endDate,
  onSave,
}: {
  startDate: string;
  endDate: string;
  onSave: (startDate: string, endDate: string) => void;
}) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(start, end);
      }}
      className="flex flex-col gap-2 p-1"
    >
      <label
        htmlFor="semester-start-date"
        className="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        Start
        <Input
          id="semester-start-date"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-8 text-sm"
        />
      </label>
      <label
        htmlFor="semester-end-date"
        className="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        End
        <Input
          id="semester-end-date"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-8 text-sm"
        />
      </label>
      <Button type="submit" size="sm" disabled={!start && !end}>
        Save
      </Button>
    </form>
  );
}

function SemesterRow({
  semester,
  active,
  spaceId,
  onOpen,
}: {
  semester: Semester;
  active: boolean;
  spaceId: string;
  onOpen: () => void;
}) {
  const queryClient = useQueryClient();

  const setDates = useMutation({
    mutationFn: (patch: { startDate?: string; endDate?: string }) =>
      updateSemester(semester.entity.id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] }),
  });

  const dateRange =
    semester.startDate && semester.endDate
      ? `${format(new Date(semester.startDate), "MMM d")} – ${format(new Date(semester.endDate), "MMM d")}`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
      >
        <IconCalendarWeek size={14} className="text-muted-foreground" />
        {displayTitle(semester.entity)}
      </button>
      {active && (
        <Badge variant="outline" className="text-xs">
          Active
        </Badge>
      )}
      {dateRange ? (
        <span className="text-xs text-muted-foreground">{dateRange}</span>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Set dates
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="start">
            <DateRangeForm
              startDate={semester.startDate ?? ""}
              endDate={semester.endDate ?? ""}
              onSave={(startDate, endDate) => setDates.mutate({ startDate, endDate })}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
