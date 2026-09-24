import {
  IconCalendarStats,
  IconCheck,
  IconMapPin,
  IconPlus,
  IconSchool,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import {
  contextTarget,
  entityTarget,
} from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import {
  EntityPickerPopover,
  EntityPickerValue,
} from "@/components/entity-picker";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "@/components/filter-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CourseChip, useCourseLookup } from "@/features/courses/course-lookup";
import { moveRowFocus } from "@/components/grouped-view/grouping";
import { useCreateShortcut } from "@/hooks/use-create-shortcut";
import { createExam, listExams } from "@/lib/api/exams";
import type { Entity, Exam } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { formatShortDate, formatWeekday } from "@/lib/datetime";

/// Grid shared by every timeline row: date, rail, content. The rail's center is
/// where the connecting line runs.
const ROW_GRID =
  "grid grid-cols-[4.5rem_2rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_2.5rem_minmax(0,1fr)]";
const LINE =
  "absolute left-[calc(4.5rem+1rem)] w-px sm:left-[calc(5.5rem+1.25rem)]";

function courseFilter(courseId: string | undefined): ActiveFilter[] {
  return courseId
    ? [{ fieldId: "course", operator: "is", values: [courseId] }]
    : [];
}

/// "20% of grade". Weight is stored as a fraction (`0.2`); whole numbers are
/// read as percentages already.
function weightLabel(weight: number | null): string | null {
  if (weight === null) return null;
  return `${Math.round(weight <= 1 ? weight * 100 : weight)}% of grade`;
}

function countdown(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

/// Exams as one strict timeline: past exams fade out above, the next one stands
/// out, later ones follow in order. There is exactly one ordering on purpose, so
/// there is no grouping or sort control. A Course page's "view all" lands here
/// with `filterCourseId`, applied as a regular Course filter.
export function ExamsListView({
  spaceId,
  filterCourseId,
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<ActiveFilter[]>(() =>
    courseFilter(filterCourseId),
  );

  useEffect(() => setFilters(courseFilter(filterCourseId)), [filterCourseId]);

  const { data: exams = [], isPending } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const { courses, courseOf } = useCourseLookup(spaceId, "exam-course");

  const startCreate = useCallback(() => setCreateOpen(true), []);
  useCreateShortcut(startCreate);

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: courses.map((c) => ({ value: c.id, label: displayTitle(c) })),
      },
    ],
    [courses],
  );

  const visible = applyFilters(
    exams,
    filters,
    (exam) => courseOf.get(exam.entity.id)?.id ?? "",
  );
  const now = new Date();
  const dated = visible
    .filter((e): e is Exam & { examDate: string } => e.examDate !== null)
    .map((exam) => ({
      exam,
      days: differenceInCalendarDays(parseISO(exam.examDate), now),
    }))
    .sort((a, b) => a.exam.examDate.localeCompare(b.exam.examDate));
  const past = dated.filter((d) => d.days < 0);
  const [next, ...later] = dated.filter((d) => d.days >= 0);
  const undated = visible.filter((e) => e.examDate === null);

  const open = (exam: Exam) => openEntity(exam.entity.id, spaceId);
  const nodeProps = (exam: Exam) => ({
    exam,
    course: courseOf.get(exam.entity.id),
    onOpen: () => open(exam),
  });

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Exam",
        create: startCreate,
      })}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconCalendarStats size={16} className="text-muted-foreground" />
          Exams
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="min-w-0 flex-1">
            <FilterMenu
              fields={filterFields}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="ml-1 gap-1.5"
                onClick={startCreate}
              >
                <IconPlus />
                New exam
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Create an exam <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {!isPending && exams.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={IconCalendarStats}
            title="No exams yet"
            description="Press C to add one. Pick its Course and date, the rest comes later."
            action={{ label: "New exam", onClick: startCreate }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No exams match these filters.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onKeyDown={moveRowFocus}
        >
          <div className="flex w-full flex-col gap-6 py-8 pr-4 pl-8">
            {dated.length > 0 && (
              <div className="relative">
                <span aria-hidden className={cn(LINE, "inset-y-3 bg-border")} />
                <ol aria-label="Exam timeline" className="flex flex-col">
                  {past.map(({ exam }) => (
                    <PastNode key={exam.entity.id} {...nodeProps(exam)} />
                  ))}
                  <TodayMarker />
                  {next && (
                    <NextNode days={next.days} {...nodeProps(next.exam)} />
                  )}
                  {later.map(({ exam, days }) => (
                    <FutureNode
                      key={exam.entity.id}
                      days={days}
                      {...nodeProps(exam)}
                    />
                  ))}
                </ol>
              </div>
            )}
            {undated.length > 0 && (
              <section aria-label="Not scheduled yet" className="flex flex-col">
                <p
                  className={cn(
                    ROW_GRID,
                    "pb-1 text-xs font-medium text-muted-foreground",
                  )}
                >
                  <span className="col-start-3 pl-1">Not scheduled yet</span>
                </p>
                <div className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      LINE,
                      "inset-y-3 border-l border-dashed border-border",
                    )}
                  />
                  <ol className="flex flex-col">
                    {undated.map((exam) => (
                      <FutureNode
                        key={exam.entity.id}
                        days={null}
                        {...nodeProps(exam)}
                      />
                    ))}
                  </ol>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      <CreateExamDialog
        spaceId={spaceId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

interface NodeProps {
  exam: Exam;
  course: Entity | undefined;
  onOpen: () => void;
}

/// A timeline row. The whole row opens the exam; the button sits under the content.
function NodeRow({
  exam,
  onOpen,
  className,
  date,
  node,
  children,
}: {
  exam: Exam;
  onOpen: () => void;
  className?: string;
  date: ReactNode;
  node: ReactNode;
  children: ReactNode;
}) {
  const title = displayTitle(exam.entity);
  return (
    <li
      className={cn(ROW_GRID, "group relative items-center", className)}
      {...entityTarget(exam.entity, exam)}
    >
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="peer absolute inset-0 cursor-pointer rounded-md outline-none"
      />
      <div className="pointer-events-none relative pr-3">{date}</div>
      <div className="pointer-events-none relative flex justify-center">
        {node}
      </div>
      <div className="pointer-events-none relative min-w-0 rounded-md px-3 transition-colors group-hover:bg-accent/40 peer-focus-visible:bg-accent/50">
        {children}
      </div>
    </li>
  );
}

function DateLabel({ day, className }: { day: string; className?: string }) {
  const date = parseISO(day);
  return (
    <time
      dateTime={day}
      className={cn("flex flex-col leading-tight tabular-nums", className)}
    >
      <span className="text-xs font-medium">{formatShortDate(date)}</span>
      <span className="text-xs text-muted-foreground">
        {formatWeekday(date)}
      </span>
    </time>
  );
}

function Meta({ exam, course }: { exam: Exam; course: Entity | undefined }) {
  const weight = weightLabel(exam.weight);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {course && <CourseChip course={course} />}
      {exam.room && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <IconMapPin size={12} />
          {exam.room}
        </span>
      )}
      {weight && (
        <span className="text-xs text-muted-foreground">{weight}</span>
      )}
    </span>
  );
}

function GradeBadge({ grade }: { grade: number }) {
  return (
    <Badge variant="positive" size="md" className="shrink-0 tabular-nums">
      Grade {grade}
    </Badge>
  );
}

function PastNode({ exam, course, onOpen }: NodeProps) {
  return (
    <NodeRow
      exam={exam}
      onOpen={onOpen}
      className="py-1 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100"
      // SAFETY: only `PastNode`s, which always carry a date, reach this.
      date={<DateLabel day={exam.examDate as string} />}
      node={
        <span className="size-2 rounded-full bg-muted-foreground/50 ring-4 ring-card" />
      }
    >
      <div className="flex h-9 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          {displayTitle(exam.entity)}
        </span>
        {course && <CourseChip course={course} className="max-sm:hidden" />}
        {exam.grade !== null ? (
          <GradeBadge grade={exam.grade} />
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <IconCheck size={12} />
            Completed
          </span>
        )}
      </div>
    </NodeRow>
  );
}

/// Where today sits on the line, between what is behind and what is ahead.
function TodayMarker() {
  return (
    <li aria-hidden className={cn(ROW_GRID, "items-center py-2")}>
      <span className="pr-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Today
      </span>
      <span className="flex justify-center">
        <span className="h-px w-4 bg-foreground/40" />
      </span>
      <span className="ml-3 h-px bg-linear-to-r from-foreground/20 to-transparent" />
    </li>
  );
}

function NextNode({
  exam,
  course,
  onOpen,
  days,
}: NodeProps & { days: number }) {
  return (
    <NodeRow
      exam={exam}
      onOpen={onOpen}
      className="py-3"
      // SAFETY: the next exam is picked from dated exams only.
      date={
        <DateLabel day={exam.examDate as string} className="text-primary" />
      }
      node={
        <span className="relative flex size-4 items-center justify-center">
          <span className="absolute -inset-1.5 animate-pulse rounded-full bg-primary/25 motion-reduce:hidden" />
          <span className="relative size-4 rounded-full bg-primary ring-4 ring-primary/20" />
        </span>
      }
    >
      <div className="-mx-3 flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-primary uppercase">
            Next up
          </span>
          <span className="truncate text-base font-semibold">
            {displayTitle(exam.entity)}
          </span>
          <Meta exam={exam} course={course} />
        </div>
        <div className="flex shrink-0 flex-col items-end leading-none">
          {days <= 1 ? (
            <span className="text-2xl font-semibold text-primary">
              {countdown(days)}
            </span>
          ) : (
            <>
              <span className="text-3xl font-semibold text-primary tabular-nums">
                {days}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                days to go
              </span>
            </>
          )}
          {exam.status === "studying" && (
            <Badge variant="secondary" size="md" className="mt-2">
              Studying
            </Badge>
          )}
        </div>
      </div>
    </NodeRow>
  );
}

function FutureNode({
  exam,
  course,
  onOpen,
  days,
}: NodeProps & { days: number | null }) {
  return (
    <NodeRow
      exam={exam}
      onOpen={onOpen}
      className="py-1.5"
      date={
        exam.examDate ? (
          <DateLabel day={exam.examDate} />
        ) : (
          <span className="text-xs text-muted-foreground/60">No date</span>
        )
      }
      node={
        <span
          className={cn(
            "size-2.5 rounded-full border-2 border-muted-foreground/60 bg-card ring-4 ring-card",
            days === null && "border-dashed",
          )}
        />
      }
    >
      <div className="flex items-center gap-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-sm font-medium">
            {displayTitle(exam.entity)}
          </span>
          <Meta exam={exam} course={course} />
        </div>
        {exam.status === "studying" && (
          <Badge variant="secondary" size="md" className="shrink-0">
            Studying
          </Badge>
        )}
        {days !== null && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {countdown(days)}
          </span>
        )}
      </div>
    </NodeRow>
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
      if (!course) throw new Error("Pick a course first");
      return createExam(
        spaceId,
        `${displayTitle(course)} Exam`,
        course.id,
        examDate || null,
        null,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", spaceId] });
      if (course)
        queryClient.invalidateQueries({
          queryKey: ["relationships", course.id],
        });
    },
  });
  const createStatus = statusOf(create);
  useCloseAfterSuccess(create, () => {
    const exam = create.data;
    setCourse(null);
    setExamDate("");
    onOpenChange(false);
    create.reset();
    if (exam) openEntity(exam.entity.id, spaceId);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && !create.isSuccess) create.reset();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New exam</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="course"
            trigger={
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
              >
                <EntityPickerValue
                  entity={course}
                  placeholder="Pick a course…"
                />
              </Button>
            }
            onSelect={setCourse}
          />
          <DateInput
            aria-label="Exam date"
            placeholder="Exam date…"
            value={examDate || null}
            onChange={(day) => setExamDate(day ?? "")}
          />
          <FieldError message={create.isError && create.error.message} />
          <p className="text-xs text-muted-foreground">
            Grade, weight and status can be filled in afterward.
          </p>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={!course}
            onClick={() =>
              createStatus !== "pending" &&
              createStatus !== "success" &&
              create.mutate()
            }
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Exam created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
