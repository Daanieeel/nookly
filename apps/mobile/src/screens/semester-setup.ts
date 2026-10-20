import { ACADEMIC_SYSTEMS, type AcademicSystemKey, semesterSortKey } from "@nookly/shared/academic";

export interface PlannedSemester {
  termType: string;
  year: number;
  title: string;
}

/// The terms of a system from `count` terms ago up to and including the current one, oldest
/// first: what the setup wizard creates. A term the Space already has is left out by the
/// caller.
export function termsUpTo(
  system: AcademicSystemKey,
  current: { termType: string; year: number },
  count: number,
): PlannedSemester[] {
  const def = ACADEMIC_SYSTEMS[system];
  const all: PlannedSemester[] = [];
  for (
    let year = current.year - Math.ceil(count / def.terms.length) - 1;
    year <= current.year;
    year++
  ) {
    for (const term of def.terms)
      all.push({ termType: term.key, year, title: def.formatTitle(term, year) });
  }
  const key = (s: { termType: string; year: number }) => semesterSortKey(s) ?? 0;
  const upto = all.filter((s) => key(s) <= key(current)).sort((a, b) => key(a) - key(b));
  return upto.slice(Math.max(0, upto.length - count));
}
