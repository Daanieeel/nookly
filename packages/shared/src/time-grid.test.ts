import { describe, expect, it } from "vitest";
import {
  type GridItem,
  blockGeometry,
  daysOfView,
  layoutLanes,
  minutesOf,
  segmentsForDay,
} from "./time-grid.ts";

const item = (over: Partial<GridItem> & { id: string }): GridItem => ({
  date: "2026-10-20",
  endDate: null,
  startTime: "09:00",
  endTime: "10:00",
  allDay: false,
  ...over,
});

describe("times of day", () => {
  it("reads HH:MM as minutes since midnight", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("23:59")).toBe(1439);
    expect(minutesOf(null)).toBeNull();
    expect(minutesOf("later")).toBeNull();
  });
});

describe("what a day holds", () => {
  it("puts a timed item on its day at its time", () => {
    const { timed, allDay } = segmentsForDay([item({ id: "a" })], "2026-10-20");
    expect(allDay).toEqual([]);
    expect(timed.map((s) => [s.item.id, s.startMin, s.endMin])).toEqual([["a", 540, 600]]);
    expect(segmentsForDay([item({ id: "a" })], "2026-10-21").timed).toEqual([]);
  });

  it("gives an item with a start and no end an hour", () => {
    const { timed } = segmentsForDay([item({ id: "exam", endTime: null })], "2026-10-20");
    expect(timed[0]).toMatchObject({ startMin: 540, endMin: 600 });
  });

  it("keeps an item that runs past midnight on its day until midnight", () => {
    const { timed } = segmentsForDay(
      [item({ id: "late", startTime: "23:00", endTime: "01:00" })],
      "2026-10-20",
    );
    expect(timed[0]).toMatchObject({ startMin: 1380, endMin: 1440 });
  });

  it("puts all day items and items without a time in the strip above the hours", () => {
    const { timed, allDay } = segmentsForDay(
      [
        item({ id: "trip", allDay: true, startTime: null, endTime: null }),
        item({ id: "due", startTime: null, endTime: null }),
      ],
      "2026-10-20",
    );
    expect(timed).toEqual([]);
    expect(allDay.map((i) => i.id)).toEqual(["trip", "due"]);
  });

  it("spreads a multi day item over its days: from its start, whole days, until its end", () => {
    const conference = item({
      id: "conf",
      date: "2026-10-20",
      endDate: "2026-10-22",
      startTime: "14:00",
      endTime: "11:30",
    });
    expect(segmentsForDay([conference], "2026-10-20").timed[0]).toMatchObject({
      startMin: 840,
      endMin: 1440,
    });
    const middle = segmentsForDay([conference], "2026-10-21");
    expect(middle.timed).toEqual([]);
    expect(middle.allDay.map((i) => i.id)).toEqual(["conf"]);
    expect(segmentsForDay([conference], "2026-10-22").timed[0]).toMatchObject({
      startMin: 0,
      endMin: 690,
    });
    expect(segmentsForDay([conference], "2026-10-23")).toEqual({ timed: [], allDay: [] });
  });
});

describe("side by side columns", () => {
  const seg = (id: string, startMin: number, endMin: number) => ({
    item: item({ id }),
    startMin,
    endMin,
  });

  it("gives items that overlap a column each and the rest the whole width", () => {
    const a = seg("a", 540, 660);
    const b = seg("b", 600, 720);
    const c = seg("c", 780, 840);
    const lanes = layoutLanes([a, b, c], 15);
    expect(lanes.get(a)).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get(b)).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get(c)).toEqual({ lane: 0, lanes: 1 });
  });

  it("treats two short items that only look separate as overlapping", () => {
    const a = seg("a", 540, 545);
    const b = seg("b", 550, 555);
    const lanes = layoutLanes([a, b], 30);
    expect(lanes.get(a)?.lanes).toBe(2);
    expect(lanes.get(b)?.lanes).toBe(2);
  });
});

describe("where a block sits", () => {
  it("measures from midnight in pixels and splits the width by column", () => {
    const g = blockGeometry({ startMin: 540, endMin: 600 }, { lane: 1, lanes: 2 }, 48, 20);
    expect(g).toEqual({ top: 432, height: 48, left: 0.5, width: 0.5 });
  });

  it("never draws a block shorter than the smallest that can be read", () => {
    expect(blockGeometry({ startMin: 0, endMin: 10 }, { lane: 0, lanes: 1 }, 48, 20).height).toBe(
      20,
    );
  });
});

describe("the days of a view", () => {
  it("shows one day, three days from the one picked, a work week or a whole week", () => {
    expect(daysOfView("day", "2026-10-21", 1)).toEqual(["2026-10-21"]);
    expect(daysOfView("threeDay", "2026-10-21", 1)).toEqual([
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(daysOfView("workWeek", "2026-10-21", 1)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(daysOfView("week", "2026-10-21", 0)).toHaveLength(7);
    expect(daysOfView("week", "2026-10-21", 0)[0]).toBe("2026-10-18");
  });
});
