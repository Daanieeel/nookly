import { describe, expect, it } from "vitest";
import { setDateTimeSettings } from "#/test/time.ts";
import {
  clockCycle,
  formatClock,
  formatDate,
  formatDateTime,
  formatMonth,
  formatShortDate,
  formatTime,
  formatWeekday,
  listTimezones,
  useDateTimeSettings,
  zonedDayMinutes,
} from "./datetime.ts";
import { settings } from "./settings/settings.ts";

const american = () => setDateTimeSettings({ dateFormat: "american", timeFormat: "american" });
const european = () => setDateTimeSettings({ dateFormat: "european", timeFormat: "european" });

describe("formatDate", () => {
  it("writes the American and European numeric dates", () => {
    american();
    expect(formatDate("2026-09-28")).toBe("09/28/2026");
    european();
    expect(formatDate("2026-09-28")).toBe("28.09.2026");
  });

  it("never shifts a calendar day with the chosen zone", () => {
    setDateTimeSettings({ dateFormat: "european", timezone: "Pacific/Auckland" });
    expect(formatDate("2026-09-28")).toBe("28.09.2026");
    setDateTimeSettings({ timezone: "America/Los_Angeles" });
    expect(formatDate("2026-09-28")).toBe("28.09.2026");
  });

  it("moves an ISO instant into the chosen zone", () => {
    setDateTimeSettings({ dateFormat: "european", timezone: "Pacific/Auckland" });
    expect(formatDate("2026-09-28T20:00:00Z")).toBe("29.09.2026");
  });
});

describe("formatShortDate", () => {
  it("adds the year only when it isn't this one", () => {
    american();
    const now = new Date(2026, 5, 1);
    expect(formatShortDate("2026-01-05", now)).toBe("Jan 5");
    expect(formatShortDate("2027-01-05", now)).toBe("Jan 5, 2027");
  });
});

describe("times", () => {
  it("writes a 12 and a 24 hour clock", () => {
    american();
    expect(formatClock("14:30")).toBe("2:30 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    european();
    expect(formatClock("14:30")).toBe("14:30");
    expect(formatClock("9:00")).toBe("9:00");
  });

  it("reads a missing minute as zero", () => {
    european();
    expect(formatClock("7")).toBe("7:00");
  });

  it("formats an instant's time in the chosen zone", () => {
    setDateTimeSettings({ timeFormat: "european", timezone: "Europe/Berlin" });
    expect(formatTime("2026-01-10T12:00:00Z")).toBe("13:00");
  });

  it("joins date and time", () => {
    setDateTimeSettings({ dateFormat: "european", timeFormat: "european", timezone: "UTC" });
    expect(formatDateTime("2026-01-10T12:00:00Z")).toBe("10.01.2026, 12:00");
  });

  it("knows the clock cycle and its labels", () => {
    american();
    expect(clockCycle()).toEqual({ twelveHour: true, am: "AM", pm: "PM" });
    european();
    expect(clockCycle().twelveHour).toBe(false);
  });
});

describe("names", () => {
  it("names weekdays and months", () => {
    american();
    expect(formatWeekday("2026-03-11")).toBe("Wednesday");
    expect(formatWeekday("2026-03-11", "short")).toBe("Wed");
    expect(formatMonth(new Date(2026, 8, 1))).toBe("September 2026");
  });
});

describe("zonedDayMinutes", () => {
  it("places an instant on the day grid of the chosen zone", () => {
    setDateTimeSettings({ timezone: "Europe/Berlin" });
    expect(zonedDayMinutes("2026-01-10T23:30:00Z")).toEqual({ day: "2026-01-11", minutes: 30 });
    setDateTimeSettings({ timezone: "UTC" });
    expect(zonedDayMinutes("2026-01-10T23:30:00Z")).toEqual({
      day: "2026-01-10",
      minutes: 23 * 60 + 30,
    });
  });

  it("follows the system zone by default", () => {
    // Tests run in UTC.
    expect(zonedDayMinutes("2026-01-10T08:15:00Z")).toEqual({ day: "2026-01-10", minutes: 495 });
  });
});

describe("settings", () => {
  it("lists the runtime's zones", () => {
    expect(listTimezones()).toContain("Europe/Berlin");
  });

  it("saves only the fields that change", () => {
    useDateTimeSettings.getState().update({ timeFormat: "american" });
    expect(settings.get("general.timeFormat")).toBe("american");
    expect(settings.get("general.dateFormat")).toBe("timezone");
    expect(useDateTimeSettings.getState().timeFormat).toBe("american");
  });
});
