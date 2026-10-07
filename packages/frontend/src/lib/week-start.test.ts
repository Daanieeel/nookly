import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { setDateTimeSettings } from "#/test/time.ts";
import { resolveWeekStart, useWeekStartsOn } from "./week-start.ts";

describe("resolveWeekStart", () => {
  it("keeps the given day for auto", () => {
    expect(resolveWeekStart("auto", 0)).toBe(0);
    expect(resolveWeekStart("auto", 1)).toBe(1);
  });

  it("uses the chosen day over the automatic one", () => {
    expect(resolveWeekStart("monday", 0)).toBe(1);
    expect(resolveWeekStart("sunday", 1)).toBe(0);
    expect(resolveWeekStart("saturday", 1)).toBe(6);
  });
});

describe("useWeekStartsOn", () => {
  it("follows the date format while on auto", () => {
    setDateTimeSettings({ dateFormat: "american" });
    const { result } = renderHook(() => useWeekStartsOn());
    expect(result.current).toBe(0);
    act(() => setDateTimeSettings({ dateFormat: "european" }));
    expect(result.current).toBe(1);
  });

  it("follows the setting once it is not auto", () => {
    setDateTimeSettings({ dateFormat: "american" });
    const { result } = renderHook(() => useWeekStartsOn());
    act(() => settings.set("calendar.weekStart", "saturday"));
    expect(result.current).toBe(6);
    act(() => settings.set("calendar.weekStart", "monday"));
    expect(result.current).toBe(1);
  });
});
