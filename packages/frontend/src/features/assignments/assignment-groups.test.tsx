import { describe, expect, it } from "vitest";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { makeAssignment, makeEntity, makeSpace } from "#/test/fixtures.ts";
import { freezeTime } from "#/test/time.ts";
import { assignmentFilterFields, assignmentFilterValue } from "./assignment-filter-fields.tsx";
import { assignmentGroupDefs } from "./assignment-groups.tsx";

const algebra = makeEntity({ id: "c1", type: "course", title: "Algebra" });
const untitled = makeEntity({ id: "c2", type: "course", title: "" });
const graded = makeAssignment(
  { grade: 1.3, status: "evaluated", dueDate: "2026-03-01" },
  { id: "g" },
);
const open = makeAssignment(
  { grade: null, status: "in_progress", dueDate: "2026-03-01" },
  { id: "o" },
);
const courseOf = new Map([["g", algebra]]);
const ids = (items: { entity: { id: string } }[]) => items.map((a) => a.entity.id);

describe("assignmentGroupDefs", () => {
  it("has no groups without a grouping", () => {
    expect(assignmentGroupDefs("none", [], courseOf)).toBeNull();
  });

  it("groups by deadline, with past work handed in kept apart and collapsed", () => {
    freezeTime("2026-03-11T10:00:00");
    const defs = assignmentGroupDefs("deadline", [], courseOf) ?? [];
    expect(defs.map((d) => d.name)).toEqual([
      "Overdue",
      "Today",
      "This Week",
      "Next Week",
      "Later",
      "No Due Date",
      "Done",
    ]);
    const groups = buildGroups([graded, open], defs, null);
    expect(groups.find((g) => g.id === "overdue")?.items.map((a) => a.entity.id)).toEqual(["o"]);
    expect(groups.find((g) => g.id === "done")).toMatchObject({ defaultCollapsed: true });
    expect(groups.find((g) => g.id === "done")?.items.map((a) => a.entity.id)).toEqual(["g"]);
  });

  it("groups by grade", () => {
    const groups = buildGroups(
      [graded, open],
      assignmentGroupDefs("grade", [], courseOf) ?? [],
      null,
    );
    expect(groups.map((g) => [g.id, ids(g.items)])).toEqual([
      ["graded", ["g"]],
      ["no-grade", ["o"]],
      ["ungraded", []],
    ]);
  });

  it("groups by status in workflow order", () => {
    const defs = assignmentGroupDefs("status", [], courseOf) ?? [];
    expect(defs.map((d) => d.id)).toEqual(["not_started", "in_progress", "submitted", "evaluated"]);
  });

  it("groups by course, untitled courses by their placeholder, unlinked ones last", () => {
    const groups = buildGroups(
      [graded, open],
      assignmentGroupDefs("course", [algebra, untitled], courseOf) ?? [],
      null,
    );
    expect(groups.map((g) => [g.name, ids(g.items)])).toEqual([
      ["Algebra", ["g"]],
      ["Untitled Course", []],
      ["No course", ["o"]],
    ]);
  });

  it("groups by Space", () => {
    const defs = assignmentGroupDefs("space", [], courseOf, [makeSpace({ id: "space-1" })]) ?? [];
    expect(defs.map((d) => d.match(open))).toEqual([true]);
  });

  it("groups by created and updated age", () => {
    freezeTime("2026-03-11T10:00:00");
    const recent = makeAssignment(
      {},
      { createdAt: "2026-03-10T10:00:00Z", updatedAt: "2026-03-11T08:00:00Z" },
    );
    const created = assignmentGroupDefs("created", [], courseOf) ?? [];
    const updated = assignmentGroupDefs("updated", [], courseOf) ?? [];
    expect(created.map((d) => d.name)).toEqual([
      "Added Today",
      "Added This Week",
      "Added Last Week",
      "Earlier",
    ]);
    expect(created.filter((d) => d.match(recent)).map((d) => d.id)).toEqual(["week"]);
    expect(updated.filter((d) => d.match(recent)).map((d) => d.id)).toEqual(["today"]);
  });
});

describe("assignment filters", () => {
  it("lists the fields in menu order", () => {
    expect(assignmentFilterFields([algebra]).map((f) => f.id)).toEqual([
      "course",
      "status",
      "due",
      "session",
      "grade",
      "evaluatedAt",
      "created",
      "updated",
    ]);
  });

  it("filters on when an assignment was evaluated", () => {
    freezeTime("2026-03-11T10:00:00");
    const today = makeAssignment(
      { status: "evaluated", evaluatedAt: "2026-03-11T08:00:00" },
      { id: "e" },
    );
    const old = makeAssignment(
      { status: "evaluated", evaluatedAt: "2026-01-02T08:00:00" },
      { id: "e2" },
    );
    expect(assignmentFilterValue(today, "evaluatedAt", courseOf)).toBe("today");
    expect(assignmentFilterValue(old, "evaluatedAt", courseOf)).toBe("earlier");
    expect(assignmentFilterValue(open, "evaluatedAt", courseOf)).toBe("none");
    const field = assignmentFilterFields([]).find((f) => f.id === "evaluatedAt");
    expect(field?.label).toBe("Evaluated at");
    expect(field?.options.map((o) => o.label)).toEqual([
      "Today",
      "This week",
      "Last week",
      "Earlier",
      "Not evaluated",
    ]);
  });

  it("offers courses by title, with their key", () => {
    expect(assignmentFilterFields([algebra, untitled])[0].options).toMatchObject([
      { value: "c1", label: "Algebra", entityKey: algebra.key },
      { value: "c2", label: "Untitled Course", entityKey: untitled.key },
    ]);
  });

  it("reads an assignment's value per field", () => {
    freezeTime("2026-03-11T10:00:00");
    expect(assignmentFilterValue(graded, "course", courseOf)).toBe("c1");
    expect(assignmentFilterValue(open, "course", courseOf)).toBe("");
    expect(assignmentFilterValue(open, "space", courseOf)).toBe("space-1");
    expect(assignmentFilterValue(open, "due", courseOf)).toBe("overdue");
    expect(assignmentFilterValue(graded, "due", courseOf)).toBe("done");
    expect(assignmentFilterValue(graded, "grade", courseOf)).toBe("graded");
    expect(assignmentFilterValue(open, "grade", courseOf)).toBe("none");
    expect(assignmentFilterValue(open, "created", courseOf)).toBe("earlier");
    expect(assignmentFilterValue(open, "status", courseOf)).toBe("in_progress");
  });

  it("tells an assignment tied to a session today from the rest", () => {
    freezeTime("2026-03-11T10:00:00");
    // Due the day before a session that is today.
    const tied = makeAssignment({ dueDate: "2026-03-10", dueSessionOffsetDays: 1 }, { id: "t" });
    expect(assignmentFilterValue(tied, "session", courseOf)).toBe("today");
    expect(assignmentFilterValue(open, "session", courseOf)).toBe("none");
  });

  it("reads the status for any unknown field", () => {
    expect(assignmentFilterValue(open, "mystery", courseOf)).toBe("in_progress");
  });
});

describe("ungraded assignments", () => {
  const homework = makeAssignment({ ungraded: true, status: "submitted" }, { id: "h" });

  it("have their own value under the grade filter", () => {
    expect(assignmentFilterValue(homework, "grade", new Map())).toBe("ungraded");
    expect(assignmentFilterValue(open, "grade", new Map())).toBe("none");
    expect(assignmentFilterValue(graded, "grade", new Map())).toBe("graded");
    const grade = assignmentFilterFields([]).find((f) => f.id === "grade");
    expect(grade?.options.map((o) => o.value)).toEqual(["graded", "none", "ungraded"]);
  });

  it("are grouped apart from the ones still waiting for a grade", () => {
    const defs = assignmentGroupDefs("grade", [], courseOf) ?? [];
    const groups = buildGroups([graded, open, homework], defs, null);
    expect(ids(groups.find((g) => g.id === "no-grade")?.items ?? [])).toEqual(["o"]);
    expect(ids(groups.find((g) => g.id === "ungraded")?.items ?? [])).toEqual(["h"]);
  });
});
