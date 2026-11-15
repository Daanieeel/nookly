import type { AgendaItem } from "@nookly/shared/data";
import { untilText, upNext } from "./home-model.ts";

const TODAY = "2026-11-15";
const item = (id: string, over: Partial<AgendaItem>): AgendaItem => ({
  id,
  kind: "calendar_entry",
  spaceId: "s",
  title: id,
  date: TODAY,
  endDate: null,
  startTime: null,
  endTime: null,
  allDay: false,
  location: null,
  description: null,
  ...over,
});

// The phone's Home leads with what is on now or next today, as a lock screen widget does.
describe("what is up next today", () => {
  const day = [
    item("all day", { allDay: true }),
    item("lecture", { kind: "session", startTime: "10:15", endTime: "11:45" }),
    item("lunch", { startTime: "12:30", endTime: "13:30" }),
    item("call", { startTime: "17:00" }),
  ];

  it("is what is going on right now, until it ends", () => {
    expect(upNext(day, TODAY, "10:40")).toEqual({ item: day[1], now: true, minutes: 65 });
  });

  it("is the next thing that starts once nothing is going on", () => {
    expect(upNext(day, TODAY, "11:50")).toEqual({ item: day[2], now: false, minutes: 40 });
    expect(upNext(day, TODAY, "08:00")?.item.id).toBe("lecture");
  });

  it("counts something without an end as over once it has started", () => {
    expect(upNext(day, TODAY, "16:00")?.item.id).toBe("call");
    expect(upNext(day, TODAY, "17:01")).toBeNull();
  });

  it("skips all day items and other days", () => {
    expect(
      upNext(
        [day[0], item("tomorrow", { date: "2026-11-16", startTime: "09:00" })],
        TODAY,
        "08:00",
      ),
    ).toBeNull();
  });
});

describe("how long until it", () => {
  it("says minutes, then hours and minutes", () => {
    expect(untilText({ now: false, minutes: 0 })).toBe("Starting now");
    expect(untilText({ now: false, minutes: 25 })).toBe("In 25 min");
    expect(untilText({ now: false, minutes: 60 })).toBe("In 1 h");
    expect(untilText({ now: false, minutes: 95 })).toBe("In 1 h 35 min");
  });

  it("says how long is left of what is on now", () => {
    expect(untilText({ now: true, minutes: 65 })).toBe("Now, 1 h 5 min left");
    expect(untilText({ now: true, minutes: 10 })).toBe("Now, 10 min left");
  });
});
