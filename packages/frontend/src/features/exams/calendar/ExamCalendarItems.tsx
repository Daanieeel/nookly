import type { CSSProperties } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { Exam } from "#/lib/api/types.ts";
import { formatClock } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockPosition } from "../../sessions/external-calendars/overlay-layout";

const EXAM_COLOR = "var(--destructive)";

function examTooltip(exam: Exam): string {
  const title = `${exam.entity.key} ${displayTitle(exam.entity)}`;
  return exam.room ? `${title}, ${exam.room}` : title;
}

/// A timed exam on the time grid. Read only: its time and date change on its own page.
export function ExamBlock({
  exam,
  position,
  highlighted,
  accentColor,
}: {
  exam: Exam;
  position: BlockPosition;
  highlighted: boolean;
  accentColor?: string;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  return (
    <button
      type="button"
      data-calendar-item
      title={examTooltip(exam)}
      onClick={() => openEntity(exam.entity.id, exam.entity.spaceId)}
      className={cn(
        "absolute top-(--occ-top) left-(--occ-left) z-10 flex h-(--occ-height) w-(--occ-width) cursor-pointer flex-col items-stretch justify-start overflow-hidden rounded-lg border border-(--exam-color)/60 border-l-4 border-l-(--exam-color) bg-(--exam-color)/20 px-1.5 py-0.5 text-left text-xs shadow-xs hover:bg-(--exam-color)/30",
        highlighted && "ring-2 ring-(--exam-color)",
      )}
      // SAFETY: the `--occ-*` vars only ever receive plain pixel or `calc()` lengths
      // computed from this exam's own time and column, and `--exam-color` only ever
      // receives `accentColor` (a Space's own validated hex accent) or a token.
      style={
        {
          "--occ-top": `${position.top}px`,
          "--occ-height": `${position.height}px`,
          "--occ-left": position.left,
          "--occ-width": position.width,
          "--exam-color": accentColor ?? EXAM_COLOR,
        } as CSSProperties
      }
      {...entityTarget(exam.entity, exam)}
    >
      <span className="flex min-w-0 items-center gap-1 font-semibold">
        <EntityIcon entity={exam.entity} size={14} className="shrink-0 text-(--exam-color)" />
        <span className="truncate">{displayTitle(exam.entity)}</span>
      </span>
      {exam.examTime && <span className="truncate opacity-70">{formatClock(exam.examTime)}</span>}
      {exam.room && <span className="truncate opacity-70">{exam.room}</span>}
    </button>
  );
}

/// An exam as one line: in the all day strip when it has no time, and in a month cell.
export function ExamChip({
  exam,
  highlighted,
  showTime = false,
  accentColor,
}: {
  exam: Exam;
  highlighted: boolean;
  showTime?: boolean;
  accentColor?: string;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  return (
    <button
      type="button"
      data-calendar-item
      title={examTooltip(exam)}
      onClick={() => openEntity(exam.entity.id, exam.entity.spaceId)}
      className={cn(
        "flex h-5 w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border-l-4 border-l-(--exam-color) bg-(--exam-color)/25 px-1 text-left text-xs font-medium hover:bg-(--exam-color)/35",
        highlighted && "ring-2 ring-(--exam-color)",
      )}
      // SAFETY: see `ExamBlock` above, a hex color or a token.
      style={{ "--exam-color": accentColor ?? EXAM_COLOR } as CSSProperties}
      {...entityTarget(exam.entity, exam)}
    >
      {showTime && exam.examTime && (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {formatClock(exam.examTime)}
        </span>
      )}
      <EntityIcon entity={exam.entity} size={13} className="shrink-0 text-(--exam-color)" />
      <span className="truncate">{displayTitle(exam.entity)}</span>
    </button>
  );
}
