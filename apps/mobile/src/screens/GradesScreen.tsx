import {
  type CourseReport,
  type GradeItem,
  type SemesterReport,
  updateAssignment,
  updateExam,
} from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconCalendarStats } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useGradeReport } from "../data/queries.ts";
import { Band } from "../ui/Band.tsx";
import { cn } from "../ui/classes.ts";
import { Empty } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel } from "./dates.ts";

/// Up to two decimals, so a 1.7 stays 1.7 and a 1.5333 becomes 1.53.
export const formatGrade = (grade: number | null) =>
  grade === null ? "No grade" : String(Math.round(grade * 100) / 100);

/// A number typed with a dot or a comma; blank is nothing, anything else is not one.
function parseNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/// A number edited in a cell of the table: blank clears it, a typo goes back to what it was.
function Cell({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  onSave: (value: number | null) => void;
}) {
  const theme = useTheme();
  const shown = value === null ? "" : String(Math.round(value * 100) / 100);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.mutedForeground}
      keyboardType="decimal-pad"
      onChangeText={setText}
      onEndEditing={() => {
        const next = parseNumber(text);
        if (next === undefined) setText(shown);
        else if (next !== value) onSave(next);
      }}
      className="h-9 w-16 rounded-md border border-border px-2 text-right font-sans text-sm text-foreground"
    />
  );
}

/// An exam or assignment of a course in the table: its day, its weight (blank is "auto":
/// an even share of what is left) and its grade, both edited in place.
function ItemRow({ item }: { item: GradeItem }) {
  const router = useRouter();
  const title = item.entity.title || (item.kind === "exam" ? "Exam" : "Assignment");
  const save = useLocalWrite((db, patch: { weight?: number | null; grade?: number | null }) =>
    item.kind === "exam"
      ? updateExam(db, item.entity.id, patch)
      : updateAssignment(db, item.entity.id, patch),
  );
  return (
    <View className="gap-1 border-t border-border/60 px-3 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${item.kind === "exam" ? "Exam" : "Assignment"}`}
        onPress={() => router.push(`/entity/${item.entity.id}`)}
        className="flex-row items-baseline gap-2"
      >
        <Text numberOfLines={1} className="flex-1">
          {title}
        </Text>
        <Text variant="small" tone="muted">
          {item.date ? dayLabel(item.date) : "No day"}
        </Text>
      </Pressable>
      <View className="flex-row items-center justify-end gap-3">
        <Text variant="small" tone="muted">
          Weight %
        </Text>
        <Cell
          label={`Weight of ${title}`}
          value={item.weight === null ? null : item.weight > 1 ? item.weight : item.weight * 100}
          placeholder="auto"
          onSave={(percent) => save.mutate({ weight: percent === null ? null : percent / 100 })}
        />
        <Text variant="small" tone="muted">
          Grade
        </Text>
        <Cell
          label={`Grade of ${title}`}
          value={item.grade}
          placeholder="None"
          onSave={(grade) => save.mutate({ grade })}
        />
      </View>
    </View>
  );
}

/// How a course's grade is made: one segment per item, as wide as its weight, filled once
/// it is graded.
function SegmentedBar({ items }: { items: GradeItem[] }) {
  if (items.length === 0) return null;
  return (
    <View className="h-2 flex-row gap-0.5 overflow-hidden rounded-full">
      {items.map((item) => (
        <View
          key={item.entity.id}
          style={{ flex: Math.max(item.share, 0.02) }}
          className={item.grade === null ? "bg-muted" : "bg-primary"}
        />
      ))}
    </View>
  );
}

function CourseCard({ report }: { report: CourseReport }) {
  const router = useRouter();
  const { grades } = report;
  return (
    <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0")}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${report.course.title || "Untitled"}, ${grades.gradedCount} of ${grades.itemCount} graded`}
        onPress={() => router.push(`/entity/${report.course.id}`)}
        className="gap-2 p-3 active:bg-accent/40"
      >
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="flex-1 font-medium">
            {report.course.title || "Untitled"}
          </Text>
          <Text className="font-semibold">{formatGrade(grades.grade)}</Text>
        </View>
        <Text variant="small" tone="muted">
          {`${grades.gradedCount} of ${grades.itemCount} graded`}
        </Text>
        <SegmentedBar items={report.items} />
      </Pressable>
      {report.items.map((item) => (
        <ItemRow key={item.entity.id} item={item} />
      ))}
    </View>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View className={cn(CARD_CLASSES, "flex-1 gap-1 p-3")}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="title" className="text-3xl">
        {value}
      </Text>
      {note ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const semesterName = (group: SemesterReport) =>
  group.semester ? group.semester.entity.title.trim() || "Untitled" : "No semester";

/// Your grades as a report: the cumulative average and the current semester's up top, then a
/// band per semester with a card per course, its segments by weight and the exams and
/// assignments behind it with a weight and a grade you can change.
export function GradesScreen({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const { data: report } = useGradeReport(spaceId);
  if (!report) return null;
  if (report.semesters.length === 0) {
    return (
      <Screen>
        <Empty text="No courses to report on yet. Add courses, then their exams and assignments, and your grades show up here." />
      </Screen>
    );
  }
  const current = report.semesters.find((g) => g.semester?.isCurrent);
  return (
    <Screen>
      <View className="flex-row gap-3">
        <Figure label="Cumulative average" value={formatGrade(report.gpa)} />
        <Figure
          label="Current semester"
          value={formatGrade(current?.gpa ?? null)}
          note={
            current
              ? `${semesterName(current)}, ${current.gradedCourseCount} graded ${current.gradedCourseCount === 1 ? "course" : "courses"}`
              : "No current semester"
          }
        />
      </View>
      {report.semesters.map((group) => (
        <Band
          key={group.semester?.entity.id ?? "none"}
          icon={<IconCalendarStats size={16} color={theme.colors.mutedForeground} />}
          title={semesterName(group)}
          count={group.courses.length}
          badge={group.semester?.isCurrent ? "Current" : undefined}
        >
          <View className="gap-3">
            <Text variant="small" tone="muted">
              {`${group.gradedCourseCount} of ${group.courses.length} graded · average ${formatGrade(group.gpa)}`}
            </Text>
            {group.courses.map((course) => (
              <CourseCard key={course.course.id} report={course} />
            ))}
          </View>
        </Band>
      ))}
    </Screen>
  );
}
