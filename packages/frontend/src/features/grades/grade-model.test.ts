import { describe, expect, it } from "vitest";
import type { GradeItem, GradeReport, SemesterReport } from "#/lib/api/types.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { freezeTime } from "#/test/time.ts";
import {
  byDate,
  currentGroup,
  formatGrade,
  formatShare,
  groupKey,
  groupTitle,
  orderedGroups,
  startsOpen,
  trend,
} from "./grade-model.ts";

function group(
  title: string | null,
  patch: { year?: number; termType?: string; isCurrent?: boolean } = {},
): SemesterReport {
  return {
    semester:
      title === null
        ? null
        : {
            entity: makeEntity({ id: title, type: "semester", title }),
            startDate: null,
            endDate: null,
            termType: patch.termType ?? null,
            year: patch.year ?? null,
            isCurrent: patch.isCurrent ?? false,
            manualPosition: null,
          },
    gpa: null,
    gradedCourseCount: 0,
    courses: [],
  };
}

const report = (...semesters: SemesterReport[]): GradeReport => ({ semesters, gpa: null });

describe("formatGrade", () => {
  it("keeps up to two decimals", () => {
    expect(formatGrade(1.7)).toBe("1.7");
    expect(formatGrade(1.5333)).toBe("1.53");
    expect(formatGrade(2)).toBe("2");
  });

  it("has a word for no grade", () => {
    expect(formatGrade(null)).toBe("No grade");
  });
});

describe("formatShare", () => {
  it("is a whole percentage", () => {
    expect(formatShare(0.6)).toBe("60%");
    expect(formatShare(1 / 3)).toBe("33%");
    expect(formatShare(0)).toBe("0%");
  });
});

describe("orderedGroups", () => {
  it("lists semesters chronologically, with the courses in none last", () => {
    const ws = group("WS 25", { year: 2025, termType: "winter" });
    const earlier = group("SS 25", { year: 2025, termType: "summer" });
    const loose = group(null);
    const titles = orderedGroups(report(loose, ws, earlier)).map(groupTitle);
    expect(titles).toEqual(["SS 25", "WS 25", "No semester"]);
  });

  it("names a group", () => {
    expect(groupTitle(group("WS 25"))).toBe("WS 25");
    expect(groupTitle(group(null))).toBe("No semester");
    expect(groupKey(group("WS 25"))).toBe("WS 25");
    expect(groupKey(group(null))).toBe("none");
  });
});

describe("currentGroup", () => {
  it("is the semester marked as current", () => {
    const current = group("SS", { isCurrent: true });
    expect(currentGroup(report(group("WS"), current))).toBe(current);
  });

  it("is none when no semester can be told to be current", () => {
    freezeTime("2026-03-11T10:00:00");
    expect(currentGroup(report(group(null)))).toBeNull();
    expect(currentGroup(report())).toBeNull();
  });
});

describe("byDate", () => {
  const work = (id: string, date: string | null): GradeItem => ({
    entity: makeEntity({ id, type: "exam", title: id }),
    kind: "exam",
    weight: null,
    share: 0.5,
    grade: null,
    status: "upcoming",
    date,
  });

  it("puts work in the order it happens, undated work last", () => {
    const items = [work("c", null), work("b", "2026-02-01"), work("a", "2026-01-15")];
    expect(byDate(items).map((i) => i.entity.id)).toEqual(["a", "b", "c"]);
  });
});

describe("trend", () => {
  it("lists the averages of the semesters that have one, in report order", () => {
    const ws = { ...group("WS 24"), gpa: 2.3 };
    const empty = group("SS 25");
    const ss = { ...group("WS 25"), gpa: 1.58 };
    const loose = { ...group(null), gpa: 3 };
    expect(trend([ws, empty, ss, loose])).toEqual([
      { title: "WS 24", gpa: 2.3 },
      { title: "WS 25", gpa: 1.58 },
    ]);
  });
});

describe("startsOpen", () => {
  const current = group("WS 25");
  const past = group("WS 24");

  it("opens only the current semester at first", () => {
    expect(startsOpen(current, current, {})).toBe(true);
    expect(startsOpen(past, current, {})).toBe(false);
  });

  it("opens every semester when none is current", () => {
    expect(startsOpen(past, null, {})).toBe(true);
  });

  it("keeps what was last picked", () => {
    expect(startsOpen(past, current, { "WS 24": true })).toBe(true);
    expect(startsOpen(current, current, { "WS 25": false })).toBe(false);
  });
});
