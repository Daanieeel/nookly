import { Stack } from "expo-router";
import { useAssignments, useCourses } from "../data/queries.ts";
import { Empty, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { ASSIGNMENT_DONE } from "./DashboardScreen.tsx";
import { AssignmentRows } from "./StudyLists.tsx";
import { DUE_BUCKETS, dueBucket } from "./task-view.ts";

/// Assignments of every Space by when they are due: what is overdue, due this week, later,
/// undated, and what is handed in or graded.
export function AssignmentsScreen() {
  const { data: assignments = [] } = useAssignments({});
  const { data: courses = [] } = useCourses(null);
  const courseName = (id: string | null) => courses.find((c) => c.entity.id === id)?.entity.title;
  const buckets = DUE_BUCKETS.map((bucket) => ({
    ...bucket,
    items: assignments.filter(
      (a) => dueBucket(a.dueDate, ASSIGNMENT_DONE.has(a.status)) === bucket.id,
    ),
  })).filter((b) => b.items.length > 0);
  return (
    <>
      <Stack.Screen options={{ title: "Assignments" }} />
      <Screen>
        {buckets.length === 0 ? <Empty text="No assignments yet. Add them to a course." /> : null}
        {buckets.map((bucket) => (
          <Section key={bucket.id} title={`${bucket.title} · ${bucket.items.length}`}>
            <AssignmentRows assignments={bucket.items} courseName={courseName} />
          </Section>
        ))}
      </Screen>
    </>
  );
}
