import { describe, expect, it } from "vitest";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { EFFORT_STEPS } from "#/lib/effort.ts";
import { STATUSES, makeLabel, makeSpace, makeTask } from "#/test/fixtures.ts";
import { freezeTime } from "#/test/time.ts";
import {
  AGE_FILTER_FIELDS,
  ageGroupDefs,
  spaceFilterField,
  spaceGroupDefs,
} from "./shared-view-defs.tsx";
import { taskFilterFields } from "./task-filter-fields.tsx";
import { taskGroupDefs } from "./task-groups.tsx";
import { statusKind } from "./task-model.ts";
import { IconClockPlus } from "@tabler/icons-react";

const kindOf = (id: string) =>
  statusKind(STATUSES.find((s) => s.id === id) ?? STATUSES[0], STATUSES);
const labels = [makeLabel({ id: "l1", name: "Home" })];
const spaces = [makeSpace({ id: "s1", name: "Uni" }), makeSpace({ id: "s2", name: "Home" })];
const ids = (items: { entity: { id: string } }[]) => items.map((t) => t.entity.id);

describe("taskGroupDefs", () => {
  it("has no groups without a grouping", () => {
    expect(taskGroupDefs("none", STATUSES, labels, kindOf)).toBeNull();
  });

  it("groups by status in status order", () => {
    const defs = taskGroupDefs("status", STATUSES, labels, kindOf) ?? [];
    expect(defs.map((d) => d.id)).toEqual(STATUSES.map((s) => s.id));
    expect(defs[1].match(makeTask({ statusId: "todo" }))).toBe(true);
    expect(defs[1].match(makeTask({ statusId: "done" }))).toBe(false);
  });

  it("groups by label with a No label group last", () => {
    const defs = taskGroupDefs("label", STATUSES, labels, kindOf) ?? [];
    expect(defs.map((d) => d.name)).toEqual(["Home", "No label"]);
    expect(defs[1].match(makeTask({ labelIds: [] }))).toBe(true);
  });

  it("groups by Space on the overview", () => {
    const tasks = [
      makeTask({}, { id: "a", spaceId: "s2" }),
      makeTask({}, { id: "b", spaceId: "s1" }),
    ];
    const groups = buildGroups(
      tasks,
      taskGroupDefs("space", STATUSES, labels, kindOf, spaces) ?? [],
      null,
    );
    expect(groups.map((g) => [g.name, ids(g.items)])).toEqual([
      ["Uni", ["b"]],
      ["Home", ["a"]],
    ]);
  });

  it("has no Space groups without Spaces", () => {
    expect(taskGroupDefs("space", STATUSES, labels, kindOf)).toEqual([]);
  });

  it("groups by due and start date buckets", () => {
    freezeTime("2026-03-11T10:00:00");
    const tasks = [
      makeTask({ dueDate: "2026-03-11", startDate: "2026-03-30" }, { id: "a" }),
      makeTask({ dueDate: null, startDate: null }, { id: "b" }),
    ];
    const due = buildGroups(tasks, taskGroupDefs("due", STATUSES, labels, kindOf) ?? [], null);
    expect(due.map((g) => [g.id, ids(g.items)])).toEqual([
      ["overdue", []],
      ["today", ["a"]],
      ["week", []],
      ["later", []],
      ["none", ["b"]],
    ]);
    const start = buildGroups(tasks, taskGroupDefs("start", STATUSES, labels, kindOf) ?? [], null);
    expect(start.find((g) => g.id === "later")?.items.map((t) => t.entity.id)).toEqual(["a"]);
    expect(start.map((g) => g.name)).toContain("No start date");
  });

  it("groups by created and updated age", () => {
    freezeTime("2026-03-11T10:00:00");
    const task = makeTask(
      {},
      { createdAt: "2026-03-11T01:00:00Z", updatedAt: "2026-03-03T01:00:00Z" },
    );
    const created = taskGroupDefs("created", STATUSES, labels, kindOf) ?? [];
    const updated = taskGroupDefs("updated", STATUSES, labels, kindOf) ?? [];
    expect(created.filter((d) => d.match(task)).map((d) => d.id)).toEqual(["today"]);
    expect(updated.filter((d) => d.match(task)).map((d) => d.id)).toEqual(["last"]);
  });
});

describe("shared view defs", () => {
  it("offers one Space filter option per Space", () => {
    const field = spaceFilterField(spaces);
    expect(field.id).toBe("space");
    expect(field.options.map((o) => [o.value, o.label])).toEqual([
      ["s1", "Uni"],
      ["s2", "Home"],
    ]);
  });

  it("pairs the Created and Updated filters", () => {
    expect(AGE_FILTER_FIELDS.map((f) => f.id)).toEqual(["created", "updated"]);
    expect(AGE_FILTER_FIELDS[0].options.map((o) => o.value)).toEqual([
      "today",
      "week",
      "last",
      "earlier",
    ]);
  });

  it("measures age groups from a fixed now", () => {
    const defs = ageGroupDefs(
      (n: { at: string }) => n.at,
      IconClockPlus,
      new Date("2026-03-11T12:00:00"),
    );
    expect(defs.find((d) => d.match({ at: "2026-03-10T00:00:00Z" }))?.id).toBe("week");
  });

  it("matches Space groups by the item's Space", () => {
    const defs = spaceGroupDefs(spaces, (n: { spaceId: string }) => n.spaceId);
    expect(defs.map((d) => d.match({ spaceId: "s2" }))).toEqual([false, true]);
  });
});

describe("taskFilterFields", () => {
  it("lists the fields in menu order", () => {
    expect(taskFilterFields(STATUSES, kindOf, "tshirt").map((f) => f.id)).toEqual([
      "status",
      "due",
      "start",
      "created",
      "updated",
      "completed",
      "effort",
    ]);
  });

  it("offers every status and the date buckets", () => {
    const fields = taskFilterFields(STATUSES, kindOf, "tshirt");
    expect(fields[0].options.map((o) => o.value)).toEqual(STATUSES.map((s) => s.id));
    expect(fields[1].options.map((o) => o.label)).toEqual([
      "Overdue",
      "Due today",
      "Next 7 days",
      "Later",
      "No due date",
    ]);
    expect(fields[5].options.at(-1)).toMatchObject({ value: "none", label: "Not completed" });
  });

  it("labels effort in the chosen scale, with no estimate last", () => {
    const tshirt = taskFilterFields(STATUSES, kindOf, "tshirt").at(-1)?.options ?? [];
    const points = taskFilterFields(STATUSES, kindOf, "fibonacci").at(-1)?.options ?? [];
    expect(tshirt.map((o) => o.label)).toEqual(["XS", "S", "M", "L", "XL", "XXL", "No estimate"]);
    expect(points.map((o) => o.label)).toEqual(["1", "2", "3", "5", "8", "13", "No estimate"]);
    expect(tshirt.map((o) => o.value)).toEqual([
      ...EFFORT_STEPS.map((s) => String(s.value)),
      "none",
    ]);
  });
});
