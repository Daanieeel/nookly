import type { AssignmentRecord } from "@nookly/shared/data";
import {
  ASSIGNMENT_ORDERINGS,
  type AssignmentOrdering,
  deadlineBucket,
  groupAssignments,
} from "./assignment-view.ts";

// Wednesday 21 October 2026.
const TODAY = "2026-10-21";
// SAFETY: a fixture with only the fields the function under test reads.
const a = (id: string, over: Partial<AssignmentRecord>) =>
  ({
    entity: { id, spaceId: "s1", createdAt: "2026-01-01" },
    courseId: "c1",
    status: "not_started",
    dueDate: null,
    ...over,
  }) as AssignmentRecord;

describe("the deadline of an assignment", () => {
  it.each([
    ["2026-10-19", "not_started", "overdue"],
    ["2026-10-21", "not_started", "today"],
    ["2026-10-25", "not_started", "week"],
    ["2026-10-26", "not_started", "next"],
    ["2026-11-01", "not_started", "next"],
    ["2026-11-02", "not_started", "later"],
    [null, "not_started", "none"],
    ["2026-10-01", "submitted", "done"],
    [null, "evaluated", "done"],
  ])("%s as %s is %s", (due, status, bucket) => {
    expect(deadlineBucket(a("x", { dueDate: due, status }), TODAY)).toBe(bucket);
  });
});

describe("the groups of the list", () => {
  const ctx = {
    today: TODAY,
    courseName: (id: string | null) => (id === "c1" ? "Algorithms" : "Logic"),
    spaceName: () => "Uni",
  };
  const list = [
    a("late", { dueDate: "2026-10-10" }),
    a("soon", { dueDate: "2026-10-23", courseId: "c2" }),
    a("done", { dueDate: "2026-10-01", status: "evaluated" }),
  ];

  it("runs from overdue to done and leaves empty groups out", () => {
    expect(
      groupAssignments(list, "due", ctx).map((g) => [g.id, g.items.map((i) => i.entity.id)]),
    ).toEqual([
      ["overdue", ["late"]],
      ["week", ["soon"]],
      ["done", ["done"]],
    ]);
  });

  it("regroups by course or status", () => {
    expect(groupAssignments(list, "course", ctx).map((g) => g.title)).toEqual([
      "Algorithms",
      "Logic",
    ]);
    expect(groupAssignments(list, "status", ctx).map((g) => g.id)).toEqual([
      "not_started",
      "evaluated",
    ]);
  });
});

describe("the order within a group", () => {
  const ctx = { today: TODAY, courseName: () => "Algorithms", spaceName: () => "Uni" };
  const titled = (id: string, over: Partial<AssignmentRecord>) =>
    a(id, { ...over, entity: { ...a(id, {}).entity, title: id, ...over.entity } });
  const list = [
    titled("b", { dueDate: "2026-10-24", grade: 2, status: "in_progress" }),
    titled("a", { dueDate: "2026-10-23", grade: null, status: "not_started" }),
    titled("c", { dueDate: "2026-10-22", grade: 5, status: "not_started" }),
  ];
  const ids = (ordering: AssignmentOrdering) =>
    groupAssignments(list, "course", ctx, ordering)[0].items.map((x) => x.entity.id);

  it("follows the ordering picked, as the desktop's Ordering does", () => {
    expect(ids("auto")).toEqual(["c", "a", "b"]);
    expect(ids("due")).toEqual(["c", "a", "b"]);
    expect(ids("title")).toEqual(["a", "b", "c"]);
    expect(ids("grade")).toEqual(["c", "b", "a"]);
    expect(ids("status")).toEqual(["c", "a", "b"]);
  });

  it("offers the desktop's orderings", () => {
    expect(ASSIGNMENT_ORDERINGS.map((o) => o.label)).toEqual([
      "Automatic",
      "Due date",
      "Created",
      "Updated",
      "Title",
      "Status",
      "Grade",
    ]);
  });
});
