/// Terms, regions and which semester is current: the same on every client.

/// What the term ordering reads of a Semester: the desktop's and the phone's own shapes
/// both have these.
export interface TermFields {
  termType: string | null;
  year: number | null;
}

export interface SemesterLike extends TermFields {
  entity: { id: string; createdAt: string };
  isCurrent: boolean;
  manualPosition: number | null;
}

/// Which term system a user's institution follows — picked once in the setup
/// wizard (PLAN §3 step 1). Not stored on Semester itself: a Semester only
/// needs its own `termType`/`year`, the system just decides which term keys
/// the wizard offers and how a title is formatted.
export type AcademicSystemKey = "winter_summer" | "fall_spring_summer";

export interface TermTypeDef {
  key: string;
  label: string;
  /// Calendar month (1-12) the term roughly starts in — used only to derive
  /// a sort/"current" key from `year`, never surfaced as a real date.
  sortMonth: number;
}

export interface AcademicSystemDef {
  label: string;
  terms: TermTypeDef[];
  formatTitle: (term: TermTypeDef, year: number) => string;
}

export const ACADEMIC_SYSTEMS = {
  winter_summer: {
    label: "Winter / Summer",
    terms: [
      { key: "winter", label: "Winter", sortMonth: 10 },
      { key: "summer", label: "Summer", sortMonth: 4 },
    ],
    formatTitle: (term, year) =>
      term.key === "winter"
        ? `Winter ${year}/${String((year + 1) % 100).padStart(2, "0")}`
        : `Summer ${year}`,
  },
  fall_spring_summer: {
    label: "Fall / Spring / Summer",
    terms: [
      { key: "fall", label: "Fall", sortMonth: 8 },
      { key: "spring", label: "Spring", sortMonth: 1 },
      { key: "summer", label: "Summer", sortMonth: 6 },
    ],
    formatTitle: (term, year) => `${term.label} ${year}`,
  },
} satisfies Record<AcademicSystemKey, AcademicSystemDef>;

/// The systems, in the order they are offered.
export const ACADEMIC_SYSTEM_KEYS = [
  "winter_summer",
  "fall_spring_summer",
] as const satisfies readonly AcademicSystemKey[];

/// Flat lookup across every system, keyed by `termType` — a Semester only
/// stores the term key, not which system it came from (see module doc), so
/// ordering/labeling elsewhere in the app reads through this.
export const TERM_TYPE_META: Record<string, TermTypeDef> = Object.fromEntries(
  Object.values(ACADEMIC_SYSTEMS)
    .flatMap((system) => system.terms)
    .map((term) => [term.key, term]),
);

/// Sort/"current" key (PLAN §1: `termType`/`year` only, dates never enter
/// this). `null` for Semesters that predate this feature or were never
/// filled in — they sort after everything that has a real key.
export function semesterSortKey(semester: TermFields): number | null {
  if (!semester.termType || semester.year == null) return null;
  const term = TERM_TYPE_META[semester.termType];
  if (!term) return null;
  return semester.year * 12 + term.sortMonth;
}

export function todaySortKey(today: Date = new Date()): number {
  return today.getFullYear() * 12 + (today.getMonth() + 1);
}

/// Guesses the "current" term for a given system as of `today` — seeds the
/// wizard's step 3 pre-guess (PLAN §3). Picks whichever configured term's
/// `sortMonth` has most recently passed within the last 12 months.
export function guessCurrentTerm(
  system: AcademicSystemKey,
  today: Date = new Date(),
): { term: TermTypeDef; year: number } {
  const terms = ACADEMIC_SYSTEMS[system].terms;
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  let best: { term: TermTypeDef; year: number; key: number } | null = null;
  for (const term of terms) {
    for (const yearOffset of [-1, 0]) {
      const year = currentYear + yearOffset;
      const key = year * 12 + term.sortMonth;
      if (key > currentYear * 12 + currentMonth) continue;
      if (!best || key > best.key) best = { term, year, key };
    }
  }
  // Should always find one given the -1/0 sweep, but the terms array is
  // non-empty by construction anyway.
  return best ?? { term: terms[0], year: currentYear };
}

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

/// The "current" Semester (PLAN §1/§2) — driven entirely by `termType`/`year`
/// (never `startDate`/`endDate`, so this keeps working even if a user clears
/// or never fills in the date fields). Priority:
/// 1. A manual `isCurrent` override always wins — the heuristic below only
///    ever sets initial defaults, per PLAN §2's "never locks anything."
/// 2. Otherwise, the most recent Semester whose computed start has already
///    passed (a rough "which term are we in" heuristic).
/// 3. Otherwise (no Semester has both `termType`/`year` set — e.g. every one
///    predates this feature), falls back to most-recently-created.
/// `null` only when there are no Semesters at all.
export function resolveActiveSemesterId(semesters: SemesterLike[]): string | null {
  if (semesters.length === 0) return null;

  const manual = semesters.find((s) => s.isCurrent);
  if (manual) return manual.entity.id;

  const todayKey = todaySortKey();
  const started = semesters
    .map((s) => ({ semester: s, key: semesterSortKey(s) }))
    .filter(
      (x): x is { semester: SemesterLike; key: number } => x.key !== null && x.key <= todayKey,
    )
    .sort((a, b) => b.key - a.key);
  if (started.length > 0) return started[0].semester.entity.id;

  return [...semesters].sort((a, b) => b.entity.createdAt.localeCompare(a.entity.createdAt))[0]
    .entity.id;
}

/// Chronological display order (PLAN §2) — a manual drag-reorder
/// (`manualPosition`) always wins over the computed `termType`/`year` order;
/// Semesters missing both sort last, in creation order.
export function orderSemesters<T extends SemesterLike>(semesters: T[]): T[] {
  return [...semesters].sort((a, b) => {
    if (a.manualPosition != null && b.manualPosition != null) {
      return a.manualPosition - b.manualPosition;
    }
    if (a.manualPosition != null) return -1;
    if (b.manualPosition != null) return 1;

    const aKey = semesterSortKey(a);
    const bKey = semesterSortKey(b);
    if (aKey != null && bKey != null) return aKey - bKey;
    if (aKey != null) return -1;
    if (bKey != null) return 1;
    return a.entity.createdAt.localeCompare(b.entity.createdAt);
  });
}
