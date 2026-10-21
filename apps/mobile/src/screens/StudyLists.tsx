import { ASSIGNMENT_STATUSES, EXAM_STATUSES } from "@nookly/shared/colors";
import { useEntityMenu } from "./entity-actions.tsx";
import type { AssignmentRecord, CourseRecord, DeckRecord, ExamRecord } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row } from "../ui/Row.tsx";
import { dayLabel } from "./dates.ts";
import { StatusIcon } from "./TaskRow.tsx";

/// Rows of Courses, Exams, Assignments and Decks, for their module pages and a Course.

function Rows<T extends { entity: { id: string } }>({
  items,
  empty,
  render,
}: {
  items: T[];
  empty: string;
  render: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return <Empty text={empty} />;
  return items.map((item) => <View key={item.entity.id}>{render(item)}</View>);
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

export function CourseRows({ courses }: { courses: CourseRecord[] }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  return (
    <Rows
      items={courses}
      empty="No courses yet."
      render={(c) => (
        <Row
          title={c.entity.title || "Untitled"}
          subtitle={c.professor ?? c.entity.key}
          icon={<EntityIcon type="course" icon={c.entity.icon} />}
          onPress={() => router.push(`/entity/${c.entity.id}`)}
          onLongPress={() => entityMenu(c.entity)}
        />
      )}
    />
  );
}

export function ExamRows({
  exams,
  courseName,
}: {
  exams: ExamRecord[];
  courseName?: (id: string | null) => string | undefined;
}) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  return (
    <Rows
      items={exams}
      empty="No exams yet."
      render={(e) => (
        <Row
          title={e.entity.title || "Untitled"}
          subtitle={join(
            courseName?.(e.courseId),
            e.examDate ? dayLabel(e.examDate) : "No day yet",
            e.examTime,
          )}
          icon={<StatusIcon status={EXAM_STATUSES.find((s) => s.id === e.status)} size={18} />}
          onPress={() => router.push(`/entity/${e.entity.id}`)}
          onLongPress={() => entityMenu(e.entity)}
        />
      )}
    />
  );
}

export function AssignmentRows({
  assignments,
  courseName,
}: {
  assignments: AssignmentRecord[];
  courseName?: (id: string | null) => string | undefined;
}) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  return (
    <Rows
      items={assignments}
      empty="No assignments yet."
      render={(a) => (
        <Row
          title={a.entity.title || "Untitled"}
          subtitle={join(
            courseName?.(a.courseId),
            a.dueDate
              ? `Due ${dayLabel(a.dueDate)}`
              : a.dueSessionOffsetDays !== null
                ? "Due before a session"
                : null,
          )}
          icon={
            <StatusIcon status={ASSIGNMENT_STATUSES.find((s) => s.id === a.status)} size={18} />
          }
          onPress={() => router.push(`/entity/${a.entity.id}`)}
          onLongPress={() => entityMenu(a.entity)}
        />
      )}
    />
  );
}

/// "12 cards, 4 due", the counts a deck shows in lists.
export function deckSummary(stats: DeckRecord["stats"]): string {
  const waiting = stats.due + stats.learning;
  const cards = `${stats.total} ${stats.total === 1 ? "card" : "cards"}`;
  if (waiting > 0) return `${cards}, ${waiting} due`;
  return stats.new > 0 ? `${cards}, ${stats.new} new` : cards;
}

export function DeckRows({ decks }: { decks: DeckRecord[] }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  return (
    <Rows
      items={decks}
      empty="No decks yet."
      render={(d) => (
        <Row
          title={d.entity.title || "Untitled"}
          subtitle={deckSummary(d.stats)}
          icon={<EntityIcon type="index_card_deck" icon={d.entity.icon} />}
          onPress={() => router.push(`/entity/${d.entity.id}`)}
          onLongPress={() => entityMenu(d.entity)}
        />
      )}
    />
  );
}
