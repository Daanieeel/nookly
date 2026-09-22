import type { Semester } from "@/lib/api/types";

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
export function semesterSortKey(semester: Semester): number | null {
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
