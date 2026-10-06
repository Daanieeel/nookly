import {
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconReportAnalytics,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Badge } from "@nookly/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nookly/ui/components/collapsible";
import { updateAssignmentStatus, updateAssignmentWeight } from "#/lib/api/assignments.ts";
import { getGradeReport } from "#/lib/api/courses.ts";
import { updateExamGrade, updateExamWeight } from "#/lib/api/exams.ts";
import type { CourseReport, GradeItem, GradeReport, SemesterReport } from "#/lib/api/types.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { weightPercent } from "../exams/exam-model.ts";
import { NumberCell } from "./GradeCells.tsx";
import {
  byDate,
  currentGroup,
  formatGrade,
  formatShare,
  groupKey,
  groupTitle,
  orderedGroups,
  readOpenSemesters,
  saveOpenSemester,
  startsOpen,
  trend,
} from "./grade-model.ts";

/// Your grades as a transcript: the averages and their trend on top, then one semester
/// after another, the current one open. Each course shows how much of its grade is
/// decided, and the grades and weights of its work are edited right in the rows.
export function GradeReportView({ spaceId }: { spaceId: string }) {
  const { data: report } = useQuery({
    queryKey: qk.gradeReport.bySpace(spaceId),
    queryFn: () => getGradeReport(spaceId),
    // Grades are edited all over the app, so each visit starts from the latest.
    refetchOnMount: "always",
  });
  if (!report) return <div className="h-40 animate-pulse rounded-lg bg-muted/40" />;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <h1 className="text-lg font-semibold">Grades</h1>
      {report.semesters.length === 0 ? (
        <EmptyState
          icon={IconReportAnalytics}
          title="No courses to report on yet"
          description="Add courses, then their exams and assignments, and your grades show up here."
        />
      ) : (
        <Report report={report} spaceId={spaceId} />
      )}
    </div>
  );
}

function Report({ report, spaceId }: { report: GradeReport; spaceId: string }) {
  const groups = orderedGroups(report);
  const current = currentGroup(report);
  const [saved] = useState(readOpenSemesters);
  const graded = report.semesters.reduce((sum, g) => sum + g.gradedCourseCount, 0);
  const points = trend(groups);
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-5">
        <Stat
          label="Cumulative average"
          value={formatGrade(report.gpa)}
          hint={graded === 1 ? "1 graded course" : `${graded} graded courses`}
          large
        />
        <Stat
          label="Current semester"
          value={formatGrade(current?.gpa ?? null)}
          hint={current ? groupTitle(current) : "No current semester"}
        />
        {points.length >= 2 && <Trend points={points} />}
      </div>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <SemesterSection
            key={groupKey(group)}
            group={group}
            current={group === current}
            defaultOpen={startsOpen(group, current, saved)}
            spaceId={spaceId}
          />
        ))}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  large = false,
}: {
  label: string;
  value: string;
  hint: string;
  large?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", large ? "text-4xl" : "text-2xl")}>
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

type TrendPoint = ReturnType<typeof trend>[number];

const STEP = 72;
const HEIGHT = 68;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 42;

/// The semester averages as a line, oldest first. Grades come on any scale, so the line
/// only shows where they went, never whether that was good.
function Trend({ points }: { points: TrendPoint[] }) {
  const values = points.map((p) => p.gpa);
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const width = STEP * points.length;
  const x = (i: number) => STEP / 2 + i * STEP;
  const y = (gpa: number) =>
    span === 0
      ? (PLOT_TOP + PLOT_BOTTOM) / 2
      : PLOT_BOTTOM - ((gpa - min) / span) * (PLOT_BOTTOM - PLOT_TOP);
  const label = points.map((p) => `${p.title} ${formatGrade(p.gpa)}`).join(", ");
  return (
    <svg
      role="img"
      aria-label={`Semester averages: ${label}`}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={width}
      height={HEIGHT}
      className="ml-auto max-w-full text-muted-foreground"
    >
      <polyline
        points={points.map((p, i) => `${x(i)},${y(p.gpa)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className="text-primary"
      />
      {points.map((p, i) => (
        <g key={p.title}>
          <circle cx={x(i)} cy={y(p.gpa)} r={3} className="fill-primary" />
          <text
            x={x(i)}
            y={y(p.gpa) - 6}
            textAnchor="middle"
            className="fill-foreground text-xs tabular-nums"
          >
            {formatGrade(p.gpa)}
          </text>
          <text x={x(i)} y={HEIGHT - 4} textAnchor="middle" className="fill-current text-xs">
            {p.title}
          </text>
        </g>
      ))}
    </svg>
  );
}

/// One semester as a fold: its summary always, its courses when open.
function SemesterSection({
  group,
  current,
  defaultOpen,
  spaceId,
}: {
  group: SemesterReport;
  current: boolean;
  defaultOpen: boolean;
  spaceId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const title = groupTitle(group);
  const toggle = (next: boolean) => {
    setOpen(next);
    saveOpenSemester(groupKey(group), next);
  };
  return (
    <Collapsible open={open} onOpenChange={toggle} asChild>
      <section aria-label={title} className="flex flex-col">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
          >
            {open ? (
              <IconCaretDownFilled size={10} className="shrink-0 text-muted-foreground" />
            ) : (
              <IconCaretRightFilled size={10} className="shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-semibold">{title}</span>
            {current && <Badge variant="primary">Current</Badge>}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {group.gradedCourseCount} of {group.courses.length} graded
            </span>
            <span className="ml-auto shrink-0 font-medium tabular-nums">
              Average {formatGrade(group.gpa)}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 pt-1 pb-4">
            {group.courses.some((c) => c.items.length > 0) && <ColumnHeads />}
            {group.courses.map((course) => (
              <CourseBlock key={course.course.id} course={course} spaceId={spaceId} />
            ))}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/// Every row lines up on the same columns, so a date, a weight and a grade always sit
/// in the same place. The grade's right edge leaves room for the field's save state.
const DATE_COL = "w-20 shrink-0";
const WEIGHT_COL = "w-32 shrink-0";
const GRADE_COL = "w-24 shrink-0 text-right";
const GRADE_TEXT = "pr-6";

function ColumnHeads() {
  return (
    <div aria-hidden className="flex px-3 text-xs text-muted-foreground">
      <span className="flex-1" />
      <span className={DATE_COL}>Date</span>
      <span className={cn(WEIGHT_COL, "pl-1.5")}>Weight</span>
      <span className={cn(GRADE_COL, GRADE_TEXT)}>Grade</span>
    </div>
  );
}

function CourseBlock({ course, spaceId }: { course: CourseReport; spaceId: string }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { grades } = course;
  const title = displayTitle(course.course);
  return (
    <div
      role="group"
      aria-label={title}
      className="overflow-hidden rounded-lg border border-border"
    >
      <div className="flex flex-col gap-2 bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-baseline">
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <button
              type="button"
              onClick={() => openEntity(course.course.id, spaceId)}
              className="min-w-0 cursor-pointer truncate text-left font-medium hover:underline"
            >
              {title}
            </button>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {grades.gradedCount} of {grades.itemCount} graded
            </span>
          </span>
          <span
            className={cn(
              GRADE_COL,
              GRADE_TEXT,
              "text-lg font-semibold tabular-nums",
              grades.grade === null && "text-sm font-normal text-muted-foreground",
            )}
          >
            {formatGrade(grades.grade)}
          </span>
        </div>
        {course.items.length > 0 && <DecidedBar course={course} />}
      </div>
      {course.items.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          No exams or assignments yet
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {byDate(course.items).map((item) => (
            <WorkRow key={item.entity.id} item={item} spaceId={spaceId} />
          ))}
        </ul>
      )}
    </div>
  );
}

/// One segment per piece of work, as wide as its share of the course: filled once
/// graded. The words under the grade say the same, so it never rests on color alone.
function DecidedBar({ course }: { course: CourseReport }) {
  const decided = course.grades.gradedWeight;
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden className="flex h-1.5 flex-1 gap-0.5">
        {byDate(course.items).map((item) => (
          <span
            key={item.entity.id}
            // SAFETY: `--share` only ever receives `item.share`, a number from 0 to 1.
            // `CSSProperties` just doesn't model custom properties.
            style={{ "--share": item.share } as CSSProperties}
            className={cn(
              "grow-(--share) basis-0 rounded-full",
              item.grade === null ? "bg-muted-foreground/20" : "bg-primary",
            )}
          />
        ))}
      </div>
      <span className={cn(GRADE_COL, GRADE_TEXT, "text-xs text-muted-foreground tabular-nums")}>
        {decided === 0 ? "Nothing graded yet" : `${formatShare(decided)} decided`}
      </span>
    </div>
  );
}

function WorkRow({ item, spaceId }: { item: GradeItem; spaceId: string }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const queryClient = useQueryClient();
  const title = displayTitle(item.entity);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.gradeReport.bySpace(spaceId) }),
      queryClient.invalidateQueries({ queryKey: qk.exams.bySpace(spaceId) }),
      queryClient.invalidateQueries({ queryKey: qk.assignments.bySpace(spaceId) }),
    ]);
  const saveGrade = useMutation({
    mutationFn: (grade: number | null) =>
      item.kind === "exam"
        ? updateExamGrade(item.entity.id, grade)
        : updateAssignmentStatus(item.entity.id, item.status, grade),
    onSuccess: refresh,
  });
  const saveWeight = useMutation({
    mutationFn: (percent: number | null) => {
      const weight = percent === null ? null : percent / 100;
      return item.kind === "exam"
        ? updateExamWeight(item.entity.id, weight)
        : updateAssignmentWeight(item.entity.id, weight);
    },
    onSuccess: refresh,
  });
  return (
    <li aria-label={title} className="flex min-w-0 items-center px-3 py-1 hover:bg-accent/40">
      <span className="flex min-w-0 flex-1 items-center gap-2 pr-3">
        <EntityIcon entity={item.entity} size={14} className="shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => openEntity(item.entity.id, spaceId)}
          className="min-w-0 cursor-pointer truncate text-left text-sm hover:underline"
        >
          {title}
        </button>
      </span>
      <span className={cn(DATE_COL, "text-xs text-muted-foreground tabular-nums")}>
        {item.date && formatShortDate(item.date)}
      </span>
      <span className={cn(WEIGHT_COL, "flex items-center")}>
        <NumberCell
          label={`Weight for ${title}`}
          value={weightPercent(item.weight)}
          // Without a weight it takes what the others leave, shown until one is typed.
          placeholder={String(Math.round(item.share * 100))}
          max={100}
          suffix="%"
          onSave={(percent) => saveWeight.mutate(percent)}
          pending={saveWeight.isPending}
          failed={saveWeight.isError}
        />
        <span className="pl-1 text-xs text-muted-foreground">
          {item.weight === null ? "auto" : ""}
        </span>
      </span>
      <NumberCell
        label={`Grade for ${title}`}
        value={item.grade}
        placeholder="Grade"
        onSave={(grade) => saveGrade.mutate(grade)}
        pending={saveGrade.isPending}
        failed={saveGrade.isError}
        className={cn(GRADE_COL, "justify-end")}
      />
    </li>
  );
}
