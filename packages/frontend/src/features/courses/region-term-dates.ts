/// Bundled, static, offline dataset (PLAN §4) — like a locale/timezone file,
/// not a live lookup. Real semester dates vary by individual institution, not
/// just country, so this only ever seeds the wizard's date fields as a rough,
/// editable starting guess. No network call, never re-synced.
///
/// Each entry is `{ month, day }` for a term's approximate start/end, keyed
/// by the term keys in `academic-terms.ts`. Deliberately small — a handful of
/// regions per system, not exhaustive.
export interface RegionTermWindow {
  start: { month: number; day: number };
  end: { month: number; day: number };
}

export interface RegionDef {
  key: string;
  label: string;
  system: "winter_summer" | "fall_spring_summer";
  windows: Record<string, RegionTermWindow>;
}

export const REGION_TERM_DATES: RegionDef[] = [
  {
    key: "de",
    label: "Germany",
    system: "winter_summer",
    windows: {
      winter: { start: { month: 10, day: 15 }, end: { month: 2, day: 15 } },
      summer: { start: { month: 4, day: 15 }, end: { month: 7, day: 15 } },
    },
  },
  {
    key: "uk",
    label: "United Kingdom",
    system: "fall_spring_summer",
    windows: {
      fall: { start: { month: 9, day: 25 }, end: { month: 12, day: 15 } },
      spring: { start: { month: 1, day: 10 }, end: { month: 3, day: 25 } },
      summer: { start: { month: 4, day: 25 }, end: { month: 6, day: 20 } },
    },
  },
  {
    key: "us",
    label: "United States",
    system: "fall_spring_summer",
    windows: {
      fall: { start: { month: 8, day: 25 }, end: { month: 12, day: 15 } },
      spring: { start: { month: 1, day: 15 }, end: { month: 5, day: 10 } },
      summer: { start: { month: 6, day: 1 }, end: { month: 8, day: 10 } },
    },
  },
];

/// Turns a window + academic-year `year` into ISO date strings. For a term
/// whose end month is earlier than its start month (e.g. Winter Oct → Feb),
/// the end date lands in `year + 1`.
export interface ResolvedTermDates {
  startDate: string;
  endDate: string;
}

export function resolveTermDates(window: RegionTermWindow, year: number): ResolvedTermDates {
  const iso = (y: number, month: number, day: number) =>
    `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const endYear = window.end.month < window.start.month ? year + 1 : year;
  return {
    startDate: iso(year, window.start.month, window.start.day),
    endDate: iso(endYear, window.end.month, window.end.day),
  };
}
