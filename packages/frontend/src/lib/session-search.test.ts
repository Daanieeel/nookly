import { describe, expect, it, vi } from "vitest";
import { makeSession } from "#/test/fixtures.ts";
import { sessionMatches, sessionSearchText } from "./session-search.ts";

const session = makeSession(
  { courseTitle: "Physics", date: "2026-03-10", startTime: "09:00", endTime: "10:30" },
  { title: "Lecture" },
);

const finds = (query: string) => sessionMatches(session, query);

describe("sessionSearchText", () => {
  it.each([
    "physics",
    "lecture",
    "2026-03-10",
    "mar 10",
    "march 10",
    "10 mar",
    "10 march",
    "march",
    "tuesday",
    "tue",
    "2026",
    "09:00",
    "9:00",
    "9am",
    "9 am",
    "9:00 am",
    "10:30",
    "10:30 am",
  ])("is found by %s", (query) => {
    expect(finds(query)).toBe(true);
  });

  it.each(["mar 11", "monday", "2025", "9pm", "11:15", "november"])(
    "is not found by %s",
    (query) => {
      expect(finds(query)).toBe(false);
    },
  );

  it("reads an afternoon time in 24 hour and 12 hour form", () => {
    const evening = makeSession({ date: "2026-03-10", startTime: "17:45", endTime: "19:00" });
    const found = (q: string) => sessionMatches(evening, q);
    expect(found("17:45")).toBe(true);
    expect(found("5:45 pm")).toBe(true);
    expect(found("5:45pm")).toBe(true);
    expect(found("7pm")).toBe(true);
    expect(found("5:45 am")).toBe(false);
  });

  it("copes with a session that has no course", () => {
    const plain = makeSession({ courseTitle: null });
    expect(sessionSearchText(plain)).toContain("Lecture");
  });
});

describe("sessionMatches speed", () => {
  // The "@" menu asks about every session on every keystroke; building the search text
  // formats dates each time, which made typing after "@" lag.
  it("builds a session's search text once, however often it is asked", () => {
    const fresh = makeSession({ date: "2026-04-02", startTime: "13:00", endTime: "14:00" });
    sessionMatches(fresh, "a");
    const formatter = vi.spyOn(Intl, "DateTimeFormat");
    sessionMatches(fresh, "ap");
    sessionMatches(fresh, "apr");
    expect(formatter).not.toHaveBeenCalled();
    formatter.mockRestore();
  });
});
