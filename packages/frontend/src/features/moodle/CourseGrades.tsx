import { IconReportAnalytics } from "@tabler/icons-react";
import { Badge } from "@nookly/ui/components/badge";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleGradeItem } from "#/lib/api/moodle.ts";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { MoodleProgress } from "./MoodleProgress.tsx";
import { MoodleData, MoodleEmpty } from "./MoodleStates.tsx";
import { percentOf } from "./moodle-format.ts";
import { hasMoodleText } from "./moodle-html.ts";
import { SAMPLE_GRADES } from "./moodle-samples.ts";
import { useMoodleGrades } from "./moodle-queries.ts";

/// The course total last, whatever order Moodle lists it in.
export function orderGradeItems(items: MoodleGradeItem[]): MoodleGradeItem[] {
  const total = (i: MoodleGradeItem) => Number(i.itemType === "course");
  return [...items].sort((a, b) => total(a) - total(b));
}

const label = (item: MoodleGradeItem) =>
  item.name || (item.itemType === "course" ? "Course total" : "Grade");

export function CourseGrades({ courseId }: { courseId: number }) {
  const query = useMoodleGrades(courseId);
  return (
    <MoodleData
      query={query}
      sample={SAMPLE_GRADES}
      label="Loading your grades"
      empty={(items) =>
        items.length === 0 ? (
          <MoodleEmpty
            icon={IconReportAnalytics}
            title="No grades yet"
            description="Grades show up here once your teachers publish them."
          />
        ) : null
      }
    >
      {(items) => {
        const ordered = orderGradeItems(items);
        const total = ordered.find((i) => i.itemType === "course");
        const rest = ordered.filter((i) => i !== total);
        return (
          <div className="flex flex-col gap-4">
            {total && <GradeCard item={total} prominent />}
            {rest.length > 0 && (
              <ul className="grid gap-3 md:grid-cols-2">
                {rest.map((item) => (
                  <li key={item.id}>
                    <GradeCard item={item} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </MoodleData>
  );
}

function GradeCard({ item, prominent }: { item: MoodleGradeItem; prominent?: boolean }) {
  const percent = percentOf(item.percentage);
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4",
        prominent && "bg-linear-to-br from-accent-green/10 to-transparent p-5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold">{label(item)}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {item.range && <span>Range {item.range}</span>}
            {item.weight && <Badge variant="secondary">Weight {item.weight}</Badge>}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 font-semibold tabular-nums",
            prominent ? "text-3xl" : "text-xl",
            !item.grade && "text-muted-foreground",
          )}
        >
          {item.grade || "-"}
        </span>
      </div>
      {percent !== null && (
        <div className="flex items-center gap-2">
          <MoodleProgress
            value={percent}
            label={`${label(item)} in percent`}
            tone={percent >= 50 ? "positive" : "caution"}
            className="h-2 flex-1"
          />
          <span className="text-xs text-muted-foreground tabular-nums">{item.percentage}</span>
        </div>
      )}
      {hasMoodleText(item.feedback) && (
        <MoodleHtml html={item.feedback ?? ""} className="text-muted-foreground" />
      )}
    </div>
  );
}
