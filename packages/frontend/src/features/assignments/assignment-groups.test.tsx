import { describe, expect, it } from "vitest";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { makeAssignment, makeEntity, makeSpace } from "#/test/fixtures.ts";
import { freezeTime } from "#/test/time.ts";
import { assignmentFilterFields, assignmentFilterValue } from "./assignment-filter-fields.tsx";
import { assignmentGroupDefs } from "./assignment-groups.tsx";

const algebra = makeEntity({ id: "c1", type: "course", title: "Algebra" });
const untitled = makeEntity({ id: "c2", type: "course", title: "" });
const graded = makeAssignment({ grade: 1.3, status: "graded", dueDate: "2026-03-01" }, { id: "g" });
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
    ]);
  });

  it("groups by status in workflow order", () => {
    const defs = assignmentGroupDefs("status", [], courseOf) ?? [];
    expect(defs.map((d) => d.id)).toEqual(["not_started", "in_progress", "submitted", "graded"]);
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
      "grade",
      "created",
      "updated",
    ]);
  });

  it("offers courses by title", () => {
    expect(assignmentFilterFields([algebra, untitled])[0].options).toEqual([
      { value: "c1", label: "Algebra" },
      { value: "c2", label: "Untitled Course" },
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

  it("reads the status for any unknown field", () => {
    expect(assignmentFilterValue(open, "mystery", courseOf)).toBe("in_progress");
  });
});
