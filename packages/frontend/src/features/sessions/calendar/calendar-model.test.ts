import { describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeCalendarEntry, makeSession } from "#/test/fixtures.ts";
import { setDateTimeSettings } from "#/test/time.ts";
import {
  DAY_MINUTES,
  buildColumns,
  dayKey,
  daySpanFor,
  heightPxFor,
  isEmptySpot,
  minutesToTime,
  rangeForDay,
  rangeLabel,
  readView,
  stepAnchor,
  stepLabel,
  timeToMinutes,
  topPxFor,
  visibleDays,
  weekNumber,
  writeView,
} from "./calendar-model.ts";

// A Wednesday.
const WED = new Date(2026, 2, 11);
const keys = (days: Date[]) => days.map(dayKey);

describe("views", () => {
  it("opens the week view by default", () => {
    expect(readView()).toBe("week");
  });

  it("remembers the view per page", () => {
    writeView("month");
    writeView("day", STORAGE_KEYS.calendarView);
    expect(readView()).toBe("month");
    expect(readView(STORAGE_KEYS.calendarView)).toBe("day");
  });

  it("falls back to the week view for an unknown value", () => {
    preferences.set(STORAGE_KEYS.sessionsView, "year");
    expect(readView()).toBe("week");
  });
});

describe("visibleDays", () => {
  it("shows the anchor alone in the day view", () => {
    expect(keys(visibleDays("day", WED, 1))).toEqual(["2026-03-11"]);
  });

  it("shows Monday to Friday in the work week, whatever the week start", () => {
    expect(keys(visibleDays("workweek", WED, 0))).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
    ]);
  });

  it("starts the week on the chosen day", () => {
    expect(keys(visibleDays("week", WED, 1))[0]).toBe("2026-03-09");
    expect(keys(visibleDays("week", WED, 0))[0]).toBe("2026-03-08");
    expect(visibleDays("week", WED, 0)).toHaveLength(7);
  });

  it("spans whole weeks in the month view", () => {
    const days = visibleDays("month", WED, 1);
    expect(days.length % 7).toBe(0);
    expect(dayKey(days[0])).toBe("2026-02-23");
    expect(dayKey(days[days.length - 1])).toBe("2026-04-05");
  });

  it("covers a month that starts on the week start", () => {
    // June 2026 starts on a Monday and ends on a Tuesday.
    const days = visibleDays("month", new Date(2026, 5, 15), 1);
    expect(dayKey(days[0])).toBe("2026-06-01");
    expect(days).toHaveLength(35);
  });
});

describe("stepping", () => {
  it("steps by a day, a week or a month", () => {
    expect(dayKey(stepAnchor("day", WED, 1))).toBe("2026-03-12");
    expect(dayKey(stepAnchor("week", WED, -1))).toBe("2026-03-04");
    expect(dayKey(stepAnchor("workweek", WED, 1))).toBe("2026-03-18");
    expect(dayKey(stepAnchor("month", new Date(2026, 0, 31), 1))).toBe("2026-02-28");
  });

  it("labels the step buttons", () => {
    expect(stepLabel("day", 1)).toBe("Next day");
    expect(stepLabel("workweek", -1)).toBe("Previous week");
    expect(stepLabel("month", 1)).toBe("Next month");
  });

  it("labels the visible range", () => {
    setDateTimeSettings({ dateFormat: "american" });
    const week = visibleDays("week", WED, 1);
    expect(rangeLabel("week", week, WED)).toBe("Mar 9 to Mar 15");
    expect(rangeLabel("day", [WED], WED)).toBe("Wednesday, Mar 11");
    expect(rangeLabel("month", [], WED)).toBe("March 2026");
  });

  it("numbers weeks the ISO way, even from Sunday", () => {
    expect(weekNumber(visibleDays("week", WED, 1))).toBe(11);
    expect(weekNumber(visibleDays("week", WED, 0))).toBe(11);
  });
});

describe("minutes and pixels", () => {
  it("converts times to minutes and back", () => {
    expect(timeToMinutes("09:15")).toBe(555);
    expect(minutesToTime(555)).toBe("09:15");
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("clamps minutes into the day", () => {
    expect(minutesToTime(-30)).toBe("00:00");
    expect(minutesToTime(DAY_MINUTES)).toBe("23:59");
    expect(minutesToTime(5000)).toBe("23:59");
  });

  it("places blocks at 48 pixels an hour with a minimum height", () => {
    expect(topPxFor(90)).toBe(72);
    expect(heightPxFor(60, 120)).toBe(48);
    expect(heightPxFor(60, 65)).toBe(18);
  });
});

describe("rangeForDay", () => {
  const range = {
    date: new Date(2026, 2, 10),
    endDate: new Date(2026, 2, 12),
    startMin: 600,
    endMin: 120,
  };

  it("shows a single day range as is", () => {
    expect(rangeForDay(WED, { date: WED, startMin: 60, endMin: 120 })).toEqual({
      startMin: 60,
      endMin: 120,
    });
  });

  it("splits a multi day range into its first, middle and last day", () => {
    expect(rangeForDay(new Date(2026, 2, 10), range)).toEqual({
      startMin: 600,
      endMin: DAY_MINUTES,
    });
    expect(rangeForDay(WED, range)).toEqual({ startMin: 0, endMin: DAY_MINUTES });
    expect(rangeForDay(new Date(2026, 2, 12), range)).toEqual({ startMin: 0, endMin: 120 });
  });

  it("finds nothing outside the range", () => {
    expect(rangeForDay(new Date(2026, 2, 9), range)).toBeNull();
    expect(rangeForDay(new Date(2026, 2, 13), range)).toBeNull();
  });
});

describe("daySpanFor", () => {
  it("marks where a day falls in a multi day entry", () => {
    const entry = makeCalendarEntry({ date: "2026-03-10", endDate: "2026-03-12" });
    expect(daySpanFor(entry, new Date(2026, 2, 10))).toBe("start");
    expect(daySpanFor(entry, WED)).toBe("middle");
    expect(daySpanFor(entry, new Date(2026, 2, 12))).toBe("end");
  });

  it("marks nothing for a single day entry", () => {
    expect(daySpanFor(makeCalendarEntry(), WED)).toBeNull();
    expect(
      daySpanFor(makeCalendarEntry({ date: "2026-03-11", endDate: "2026-03-11" }), WED),
    ).toBeNull();
  });
});

describe("isEmptySpot", () => {
  it("counts the grid itself but not its items or anything outside", () => {
    const grid = document.createElement("div");
    const item = document.createElement("div");
    item.dataset.item = "";
    const inner = document.createElement("span");
    item.append(inner);
    grid.append(item);
    const outside = document.createElement("div");
    expect(isEmptySpot(grid, grid, "[data-item]")).toBe(true);
    expect(isEmptySpot(grid, inner, "[data-item]")).toBe(false);
    expect(isEmptySpot(grid, outside, "[data-item]")).toBe(false);
  });
});

describe("buildColumns", () => {
  const days = [new Date(2026, 2, 10), WED];

  it("puts sessions and timed entries on their day, ordered by start", () => {
    const sessions = [
      makeSession({ date: "2026-03-11", startTime: "10:00", endTime: "11:00" }, { id: "late" }),
      makeSession({ date: "2026-03-11", startTime: "08:00", endTime: "09:00" }, { id: "early" }),
    ];
    const entries = [
      makeCalendarEntry({ date: "2026-03-11", startTime: "09:00", endTime: "09:30" }),
    ];
    const [tuesday, wednesday] = buildColumns(days, sessions, [], entries);
    expect(tuesday.items).toEqual([]);
    expect(wednesday.key).toBe("2026-03-11");
    expect(wednesday.items.map((i) => [i.kind, i.startMin, i.endMin])).toEqual([
      ["session", 480, 540],
      ["calendarEntry", 540, 570],
      ["session", 600, 660],
    ]);
  });

  it("puts all day and multi day entries in the all day strip of every day they touch", () => {
    const entries = [
      makeCalendarEntry(
        { date: "2026-03-11", allDay: true, startTime: null, endTime: null },
        { id: "allday" },
      ),
      makeCalendarEntry({ date: "2026-03-09", endDate: "2026-03-11" }, { id: "multi" }),
    ];
    const [tuesday, wednesday] = buildColumns(days, [], [], entries);
    expect(tuesday.allDayCalendarEntries.map((e) => e.entity.id)).toEqual(["multi"]);
    expect(wednesday.allDayCalendarEntries.map((e) => e.entity.id)).toEqual(["allday", "multi"]);
    expect(wednesday.items).toEqual([]);
  });

  it("gives a timed entry without times the whole day", () => {
    const entries = [makeCalendarEntry({ date: "2026-03-11", startTime: null, endTime: null })];
    const [, wednesday] = buildColumns(days, [], [], entries);
    expect(wednesday.items.map((i) => [i.startMin, i.endMin])).toEqual([[0, 23 * 60 + 59]]);
  });

  it("lays every timed item out in a lane", () => {
    const sessions = [
      makeSession({ date: "2026-03-11", startTime: "08:00", endTime: "10:00" }, { id: "a" }),
      makeSession({ date: "2026-03-11", startTime: "09:00", endTime: "11:00" }, { id: "b" }),
    ];
    const [, wednesday] = buildColumns(days, sessions, []);
    expect(wednesday.lanes.size).toBe(2);
  });
});
