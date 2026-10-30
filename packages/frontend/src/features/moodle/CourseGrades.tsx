import { IconReportAnalytics } from "@tabler/icons-react";
import { EmptyState } from "#/components/empty-state.tsx";
import type { MoodleGradeItem } from "#/lib/api/moodle.ts";
import { Loading } from "./MoodleFrame.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { hasMoodleText } from "./moodle-html.ts";
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
  if (!query.data) return <Loading query={query} />;
  const items = orderGradeItems(query.data.data);
  if (items.length === 0) {
    return (
      <EmptyState
        icon={IconReportAnalytics}
        title="No grades yet"
        description="Grades show up here once your teachers publish them."
      />
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-1.5 pr-3 font-medium">Item</th>
          <th className="py-1.5 pr-3 font-medium">Grade</th>
          <th className="py-1.5 pr-3 font-medium">Range</th>
          <th className="py-1.5 pr-3 font-medium">Percentage</th>
          <th className="py-1.5 font-medium">Weight</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <GradeRow key={item.id} item={item} />
        ))}
      </tbody>
    </table>
  );
}

function GradeRow({ item }: { item: MoodleGradeItem }) {
  const total = item.itemType === "course";
  return (
    <>
      <tr className={total ? "border-t border-border font-medium" : undefined}>
        <td className="py-1.5 pr-3">{label(item)}</td>
        <td className="py-1.5 pr-3">{item.grade || "-"}</td>
        <td className="py-1.5 pr-3 text-muted-foreground">{item.range ?? ""}</td>
        <td className="py-1.5 pr-3 text-muted-foreground">{item.percentage ?? ""}</td>
        <td className="py-1.5 text-muted-foreground">{item.weight ?? ""}</td>
      </tr>
      {hasMoodleText(item.feedback) && (
        <tr>
          <td colSpan={5} className="pb-2">
            <MoodleHtml html={item.feedback ?? ""} className="text-muted-foreground" />
          </td>
        </tr>
      )}
    </>
  );
}
