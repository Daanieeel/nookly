import { describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeAssignment, makeSession } from "#/test/fixtures.ts";
import {
  ASSIGNMENT_VIEW_PRESETS,
  DEFAULT_DISPLAY,
  type DisplayOptions,
  dayBefore,
  upcomingSessions,
  ageBucket,
  assignmentStatus,
  createdBucket,
  deadlineBucket,
  describeDisplay,
  isDone,
  normalizeDisplay,
  orderAssignments,
  readDisplay,
  readOverviewDisplay,
  statusKindOf,
  writeDisplay,
  writeOverviewDisplay,
} from "./assignment-model.ts";

// A Wednesday; weeks start on Monday the 9th and end on Sunday the 15th.
const NOW = new Date("2026-03-11T15:00:00");
const ids = (items: { entity: { id: string } }[]) => items.map((a) => a.entity.id);

function fromDisk(json: string): Partial<DisplayOptions> {
  return JSON.parse(json);
}

describe("statuses", () => {
  it("finds a status by id and falls back to Not started", () => {
    expect(assignmentStatus("graded").name).toBe("Graded");
    expect(assignmentStatus("lost").id).toBe("not_started");
  });

  it("maps statuses to the task glyph kinds", () => {
    expect(statusKindOf("not_started")).toBe("unstarted");
    expect(statusKindOf("in_progress")).toBe("started");
    expect(statusKindOf("submitted")).toBe("started");
    expect(statusKindOf("graded")).toBe("completed");
    expect(statusKindOf("anything")).toBe("unstarted");
  });

  it("counts submitted and graded as done", () => {
    expect(isDone(makeAssignment({ status: "submitted" }))).toBe(true);
    expect(isDone(makeAssignment({ status: "graded" }))).toBe(true);
    expect(isDone(makeAssignment({ status: "in_progress" }))).toBe(false);
  });
});

describe("deadlineBucket", () => {
  it.each([
    [null, "not_started", "none"],
    ["2026-03-10", "not_started", "overdue"],
    ["2026-03-10", "submitted", "done"],
    ["2026-03-10", "graded", "done"],
    ["2026-03-11", "not_started", "today"],
    ["2026-03-11", "graded", "today"],
    ["2026-03-12", "not_started", "week"],
    ["2026-03-15", "not_started", "week"],
    ["2026-03-16", "not_started", "next"],
    ["2026-03-22", "not_started", "next"],
    ["2026-03-23", "not_started", "later"],
  ])("puts a due date of %s (%s) in %s", (dueDate, status, bucket) => {
    expect(deadlineBucket(makeAssignment({ dueDate, status }), NOW)).toBe(bucket);
  });
});

describe("ageBucket", () => {
  it.each([
    ["2026-03-11T00:30:00Z", "today"],
    ["2026-03-09T08:00:00Z", "week"],
    ["2026-03-08T23:00:00Z", "last"],
    ["2026-03-02T00:00:00Z", "last"],
    ["2026-03-01T23:59:00Z", "earlier"],
  ])("puts %s in %s", (iso, bucket) => {
    expect(ageBucket(iso, NOW)).toBe(bucket);
  });

  it("buckets an assignment by its creation", () => {
    expect(createdBucket(makeAssignment({}, { createdAt: "2026-03-11T09:00:00Z" }), NOW)).toBe(
      "today",
    );
  });
});

describe("display options", () => {
  it("reads the defaults when nothing is saved", () => {
    expect(readDisplay()).toEqual(DEFAULT_DISPLAY);
    expect(readOverviewDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("reads back what was written, apart for the overview", () => {
    writeDisplay({ ...DEFAULT_DISPLAY, grouping: "course" });
    writeOverviewDisplay({ ...DEFAULT_DISPLAY, grouping: "space" });
    expect(readDisplay().grouping).toBe("course");
    expect(readOverviewDisplay().grouping).toBe("space");
  });

  it("falls back for an unreadable value", () => {
    preferences.set(STORAGE_KEYS.assignmentsDisplay, "nope");
    expect(readDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("falls back field by field", () => {
    expect(normalizeDisplay(fromDisk('{"grouping":"priority","ordering":"grade"}'))).toEqual({
      ...DEFAULT_DISPLAY,
      ordering: "grade",
    });
  });

  it("gives a board the status grouping when stored without one", () => {
    expect(normalizeDisplay({ layout: "board", grouping: "none" }).grouping).toBe("status");
  });

  it("drops a sub-grouping that repeats the grouping", () => {
    expect(normalizeDisplay({ grouping: "course", subGrouping: "course" }).subGrouping).toBe(
      "none",
    );
    expect(normalizeDisplay({ grouping: "course", subGrouping: "status" }).subGrouping).toBe(
      "status",
    );
  });

  it("builds presets that are already valid", () => {
    for (const preset of ASSIGNMENT_VIEW_PRESETS) {
      expect(normalizeDisplay(preset.display)).toEqual(preset.display);
    }
  });

  it("describes a display", () => {
    expect(describeDisplay(DEFAULT_DISPLAY)).toEqual({
      layout: "list",
      grouping: "Deadline",
      ordering: "Automatic",
    });
    expect(describeDisplay({ ...DEFAULT_DISPLAY, grouping: "none" }).grouping).toBeNull();
  });
});

describe("orderAssignments", () => {
  const far = makeAssignment(
    { dueDate: "2026-04-30", status: "graded", grade: 2 },
    { id: "far", title: "b", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  );
  const past = makeAssignment(
    { dueDate: "2026-03-09", status: "in_progress", grade: null },
    {
      id: "past",
      title: "C",
      createdAt: "2026-01-03T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  );
  const soon = makeAssignment(
    { dueDate: "2026-03-14", status: "not_started", grade: 1 },
    {
      id: "soon",
      title: "a",
      createdAt: "2026-01-02T00:00:00Z",
      updatedAt: "2026-03-05T00:00:00Z",
    },
  );
  const undated = makeAssignment(
    { dueDate: null, status: "submitted", grade: null },
    {
      id: "undated",
      title: "d",
      createdAt: "2026-03-10T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  );
  const all = [far, past, soon, undated];

  it("orders deadline groups by distance from today", () => {
    // `undated` measures from its creation, one day ago.
    expect(ids(orderAssignments(all, "deadline", "auto", NOW))).toEqual([
      "undated",
      "past",
      "soon",
      "far",
    ]);
  });

  it("orders Created groups newest first", () => {
    expect(ids(orderAssignments(all, "created", "auto", NOW))).toEqual([
      "undated",
      "past",
      "soon",
      "far",
    ]);
  });

  it("orders Updated groups by the latest change", () => {
    expect(ids(orderAssignments(all, "updated", "auto", NOW))).toEqual([
      "soon",
      "far",
      "past",
      "undated",
    ]);
  });

  it("orders other groups by due date, undated last", () => {
    expect(ids(orderAssignments(all, "course", "auto", NOW))).toEqual([
      "past",
      "soon",
      "far",
      "undated",
    ]);
  });

  it("orders by grade, highest first and ungraded last", () => {
    expect(ids(orderAssignments(all, "none", "grade", NOW))).toEqual([
      "far",
      "soon",
      "past",
      "undated",
    ]);
  });

  it("orders by status, then due date", () => {
    expect(ids(orderAssignments(all, "none", "status", NOW))).toEqual([
      "soon",
      "past",
      "undated",
      "far",
    ]);
  });

  it("orders by title ignoring case", () => {
    expect(ids(orderAssignments(all, "none", "title", NOW))).toEqual([
      "soon",
      "far",
      "past",
      "undated",
    ]);
  });

  it("lets a chosen ordering override the grouping's own", () => {
    expect(ids(orderAssignments(all, "deadline", "created", NOW))).toEqual(
      ids(orderAssignments(all, "created", "auto", NOW)),
    );
  });
});

describe("dayBefore", () => {
  it("steps a day back across month and year ends", () => {
    expect(dayBefore("2026-03-10", 0)).toBe("2026-03-10");
    expect(dayBefore("2026-03-10", 2)).toBe("2026-03-08");
    expect(dayBefore("2026-01-02", 3)).toBe("2025-12-30");
  });
});

describe("upcomingSessions", () => {
  const session = (id: string, date: string, patch = {}) => makeSession({ date, ...patch }, { id });
  const sessions = [
    session("late", "2026-03-20"),
    session("past", "2026-03-01"),
    session("today", "2026-03-10"),
    session("cancelled", "2026-03-12", { cancelled: true }),
    session("other", "2026-03-11"),
    session("soon", "2026-03-11", { startTime: "08:00" }),
  ];
  const courseOf = new Map(
    Object.entries({
      late: "c1",
      past: "c1",
      today: "c1",
      cancelled: "c1",
      other: "c2",
      soon: "c1",
    }),
  );

  it("lists the course sessions from today on, earliest first, without cancelled ones", () => {
    const found = upcomingSessions(sessions, "c1", courseOf, "2026-03-10");
    expect(found.map((s) => s.entity.id)).toEqual(["today", "soon", "late"]);
  });
});
