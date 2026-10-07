import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { freezeTime } from "#/test/time.ts";
import { useCalendarPage } from "./calendar-page";

function startCreate(kind: "session" | "calendarEntry") {
  freezeTime("2026-03-11T08:30:00");
  const { result } = renderHook(() => useCalendarPage(undefined, kind));
  act(() => result.current.startCreate());
  return result.current.draft;
}

describe("useCalendarPage", () => {
  it("proposes a session of the session length", () => {
    expect(startCreate("session")).toMatchObject({ startMin: 9 * 60, endMin: 9 * 60 + 90 });
    settings.set("calendar.sessionLengthMinutes", 30);
    expect(startCreate("session")).toMatchObject({ startMin: 9 * 60, endMin: 9 * 60 + 30 });
  });

  it("proposes a calendar entry of the calendar entry length", () => {
    expect(startCreate("calendarEntry")).toMatchObject({ startMin: 9 * 60, endMin: 10 * 60 });
    settings.set("calendar.calendarEntryLengthMinutes", 135);
    expect(startCreate("calendarEntry")).toMatchObject({ startMin: 9 * 60, endMin: 11 * 60 + 15 });
  });
});
