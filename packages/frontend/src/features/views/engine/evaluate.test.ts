import { describe, expect, it } from "vitest";
import { makeAssignment, makeEntity, makeExam, makeTask, STATUSES } from "#/test/fixtures.ts";
import type { Entity, Relationship } from "#/lib/api/types.ts";
import { matchesCondition, operatorsFor, readCondition } from "./conditions.ts";
import { runView, scopeItems, sortItems } from "./evaluate.ts";
import { assignmentContext, assignmentSource } from "./sources/assignments.tsx";
import { examSource, type ExamContext } from "./sources/exams.tsx";
import { noteContext, noteSource } from "./sources/notes.tsx";
import { taskContext, taskSource } from "./sources/tasks.tsx";
import type { ViewCondition } from "./types.ts";

const ctx = taskContext({
  statuses: STATUSES,
  labels: [],
  courses: [],
  spaces: [],
  effortScale: "fibonacci",
});
const field = (id: string) => {
  const found = taskSource.fields.find((f) => f.id === id);
  if (!found) throw new Error(`no field ${id}`);
  return found;
};
const holds = (condition: ViewCondition, task = makeTask()) =>
  matchesCondition(field(condition.fieldId), condition, task, ctx);

describe("conditions", () => {
  it("checks a date range by day, both ends included", () => {
    const between = (dueDate: string | null) =>
      holds(
        { fieldId: "due", operator: "between", values: ["2026-11-01", "2026-11-30"] },
        makeTask({ dueDate }),
      );
    expect(between("2026-11-01")).toBe(true);
    expect(between("2026-11-30")).toBe(true);
    expect(between("2026-12-01")).toBe(false);
    expect(between(null)).toBe(false);
  });

  it("compares before and after with the day of a timestamp", () => {
    const task = makeTask({}, { createdAt: "2026-11-05T09:00:00" });
    expect(holds({ fieldId: "created", operator: "before", values: ["2026-11-06"] }, task)).toBe(
      true,
    );
    expect(holds({ fieldId: "created", operator: "after", values: ["2026-11-05"] }, task)).toBe(
      false,
    );
  });

  it("checks for an empty value", () => {
    expect(holds({ fieldId: "due", operator: "isEmpty", values: [] })).toBe(true);
    expect(holds({ fieldId: "labels", operator: "isEmpty", values: [] })).toBe(true);
    expect(
      holds(
        { fieldId: "due", operator: "isNotEmpty", values: [] },
        makeTask({ dueDate: "2026-01-01" }),
      ),
    ).toBe(true);
  });

  it("searches text ignoring case and accents", () => {
    const task = makeTask({}, { title: "Café essay" });
    expect(holds({ fieldId: "title", operator: "contains", values: ["CAFE"] }, task)).toBe(true);
    expect(holds({ fieldId: "title", operator: "notContains", values: ["essay"] }, task)).toBe(
      false,
    );
  });

  it("searches a status by its name", () => {
    expect(
      holds(
        { fieldId: "status", operator: "contains", values: ["prog"] },
        makeTask({ statusId: "doing" }),
      ),
    ).toBe(true);
  });

  it("compares numbers and leaves out an empty one", () => {
    const effort = (n: number | null, operator: ViewCondition["operator"], value: string) =>
      holds({ fieldId: "effort", operator, values: [value] }, makeTask({ effort: n }));
    expect(effort(3, "gte", "3")).toBe(true);
    expect(effort(3, "gt", "3")).toBe(false);
    expect(effort(2, "lt", "3")).toBe(true);
    expect(effort(5, "lte", "3")).toBe(false);
    expect(effort(5, "eq", "5")).toBe(true);
    expect(effort(null, "lt", "3")).toBe(false);
  });

  it("offers the operators that fit each kind of field", () => {
    expect(operatorsFor("date")).toEqual(["before", "after", "between", "isEmpty", "isNotEmpty"]);
    expect(operatorsFor("number")).toContain("gte");
    expect(operatorsFor("text")).toContain("contains");
  });

  it("reads an empty check without values", () => {
    expect(readCondition({ fieldId: "due", operator: "isEmpty", values: ["x"] })).toEqual({
      fieldId: "due",
      operator: "isEmpty",
      values: [],
    });
  });
});

describe("sorting", () => {
  const tasks = [
    makeTask({ dueDate: null }, { id: "none", title: "b" }),
    makeTask({ dueDate: "2026-02-01" }, { id: "feb", title: "a" }),
    makeTask({ dueDate: "2026-01-01" }, { id: "jan", title: "c" }),
  ];
  const ids = (list: typeof tasks) => list.map((t) => t.entity.id);

  it("keeps empty values last in both directions", () => {
    expect(
      ids(sortItems(tasks, [{ field: "due", direction: "asc" }], taskSource.fields, ctx)),
    ).toEqual(["jan", "feb", "none"]);
    expect(
      ids(sortItems(tasks, [{ field: "due", direction: "desc" }], taskSource.fields, ctx)),
    ).toEqual(["feb", "jan", "none"]);
  });

  it("sorts a status by its position, not its name", () => {
    const byStatus = [
      makeTask({ statusId: "done" }, { id: "done" }),
      makeTask({ statusId: "backlog" }, { id: "backlog" }),
      makeTask({ statusId: "doing" }, { id: "doing" }),
    ];
    expect(
      ids(sortItems(byStatus, [{ field: "status", direction: "asc" }], taskSource.fields, ctx)),
    ).toEqual(["backlog", "doing", "done"]);
  });

  it("keys sort by their number", () => {
    const keyed = [
      makeTask({}, { id: "10", key: "TSK-10" }),
      makeTask({}, { id: "9", key: "TSK-9" }),
    ];
    expect(
      ids(sortItems(keyed, [{ field: "key", direction: "asc" }], taskSource.fields, ctx)),
    ).toEqual(["9", "10"]);
  });

  it("leaves the order alone without a rule it knows", () => {
    expect(
      ids(sortItems(tasks, [{ field: "nope", direction: "asc" }], taskSource.fields, ctx)),
    ).toEqual(["none", "feb", "jan"]);
  });
});

const edge = (from: string, to: string, relationshipType: string): Relationship => ({
  id: `${from}-${to}`,
  fromEntityId: from,
  toEntityId: to,
  relationshipType,
  fromBlockId: null,
  toBlockId: null,
  createdAt: "",
});

function makeNoteSummary(id: string, courses: Entity[]) {
  return {
    entity: makeEntity({ id, type: "note", title: id }),
    preview: "",
    lastEditedAt: "2026-11-01T10:00:00.000Z",
    labelIds: [],
    linked: [],
    session: null,
    courses,
  };
}

describe("scope", () => {
  const course: Entity = makeEntity({ id: "course", type: "course", title: "Physics" });
  const mine = makeAssignment({}, { id: "mine" });
  const other = makeAssignment({}, { id: "other" });
  const edges = [
    edge("mine", "course", "assignment-course"),
    edge("other", "elsewhere", "assignment-course"),
    edge("course", "other", "relates-to"),
  ];
  const ids = (list: { entity: Entity }[]) => list.map((a) => a.entity.id);

  it("keeps the items linked to the page through the relationship", () => {
    expect(
      ids(
        scopeItems(
          [mine, other],
          (a) => a.entity,
          { relationship: "assignment-course", direction: "outgoing" },
          course.id,
          edges,
        ),
      ),
    ).toEqual(["mine"]);
  });

  it("follows the direction of the relationship", () => {
    const scoped = (direction: "outgoing" | "incoming" | "both") =>
      ids(
        scopeItems(
          [mine, other],
          (a) => a.entity,
          { relationship: "relates-to", direction },
          course.id,
          edges,
        ),
      );
    expect(scoped("outgoing")).toEqual([]);
    expect(scoped("incoming")).toEqual(["other"]);
    expect(scoped("both")).toEqual(["other"]);
  });

  it("shows a Course's Assignments, sorted by due date, with their Course", () => {
    const courseOf = new Map([["mine", course]]);
    const actx = assignmentContext([course], courseOf, []);
    const later = makeAssignment({ dueDate: "2026-12-01" }, { id: "later" });
    const sooner = makeAssignment({ dueDate: "2026-11-10" }, { id: "sooner" });
    const shown = runView(assignmentSource, [later, other, sooner], actx, {
      filters: [],
      conditions: [],
      sort: [{ field: "due", direction: "asc" }],
      scope: { relationship: "assignment-course", direction: "outgoing" },
      anchorId: course.id,
      edges: [
        edge("later", "course", "assignment-course"),
        edge("sooner", "course", "assignment-course"),
      ],
    });
    expect(ids(shown)).toEqual(["sooner", "later"]);
    const courseField = assignmentSource.fields.find((f) => f.id === "course");
    expect(courseField?.text?.(mine, actx)).toBe("Physics");
  });

  it("also keeps items whose field reads the scope's relationship and holds the page", () => {
    // A Note written for one of the Course's Sessions belongs to the Course too, though
    // only its Session links to it. The Note's Course field already knows that.
    const linked = makeNoteSummary("linked", [course]);
    const viaSession = makeNoteSummary("via-session", [course]);
    const elsewhere = makeNoteSummary("elsewhere", []);
    const shown = runView(noteSource, [linked, viaSession, elsewhere], noteContext([], []), {
      filters: [],
      conditions: [],
      sort: [],
      scope: { relationship: "course-notes", direction: "incoming" },
      anchorId: course.id,
      edges: [edge("course", "linked", "course-notes")],
    });
    expect(ids(shown).toSorted()).toEqual(["linked", "via-session"]);
  });

  it("ignores the scope without a page to scope to", () => {
    const actx = assignmentContext([], new Map(), []);
    const shown = runView(assignmentSource, [mine, other], actx, {
      filters: [],
      conditions: [],
      sort: [],
      scope: { relationship: "assignment-course", direction: "outgoing" },
    });
    expect(shown).toHaveLength(2);
  });
});

describe("running a view", () => {
  it("applies option filters and conditions together", () => {
    const tasks = [
      makeTask({ statusId: "todo", effort: 5 }, { id: "a" }),
      makeTask({ statusId: "todo", effort: 1 }, { id: "b" }),
      makeTask({ statusId: "done", effort: 8 }, { id: "c" }),
    ];
    const shown = runView(taskSource, tasks, ctx, {
      filters: [{ fieldId: "status", operator: "isNot", values: ["done"] }],
      conditions: [{ fieldId: "effort", operator: "gte", values: ["3"] }],
      sort: [],
    });
    expect(shown.map((t) => t.entity.id)).toEqual(["a"]);
  });

  it("shows any registered type, like Exams", () => {
    const ectx: ExamContext = { courses: [], courseOf: new Map(), spaces: new Map() };
    const exams = [
      makeExam({ examDate: null }, { id: "undated" }),
      makeExam({ examDate: "2026-06-01", status: "done" }, { id: "june" }),
      makeExam({ examDate: "2026-03-01" }, { id: "march" }),
    ];
    const shown = runView(examSource, exams, ectx, {
      filters: [{ fieldId: "status", operator: "isNot", values: ["done"] }],
      conditions: [],
      sort: [],
    });
    expect(shown.map((e) => e.entity.id)).toEqual(["march", "undated"]);
  });

  /// The open question of the engine: thousands of rows stay fast enough in the webview,
  /// so filtering stays out of Rust. A generous budget, so a slow CI machine passes.
  it("filters and sorts 20,000 tasks within its budget", () => {
    const tasks = Array.from({ length: 20_000 }, (_, i) =>
      makeTask(
        {
          statusId: STATUSES[i % STATUSES.length]?.id ?? "todo",
          dueDate: i % 3 ? `2026-${String((i % 12) + 1).padStart(2, "0")}-15` : null,
          effort: i % 13,
        },
        { id: `t${i}`, key: `TSK-${i}`, title: `Task ${i}` },
      ),
    );
    const started = performance.now();
    const shown = runView(taskSource, tasks, ctx, {
      filters: [{ fieldId: "status", operator: "isNot", values: ["done", "cancelled"] }],
      conditions: [
        { fieldId: "due", operator: "between", values: ["2026-03-01", "2026-10-31"] },
        { fieldId: "title", operator: "contains", values: ["task"] },
      ],
      sort: [{ field: "title", direction: "asc" }],
    });
    const elapsed = performance.now() - started;
    expect(shown.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500);
  });
});
