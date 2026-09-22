import { isWithinInterval } from "date-fns";
import type { Semester } from "@/lib/api/types";

/// The "Active" Semester — the one whose date range contains today. Falls
/// back to the most-recently-created Semester if none has both dates set,
/// or none of the ranges cover today (e.g. between terms). `null` only when
/// there are no Semesters at all.
export function resolveActiveSemesterId(semesters: Semester[]): string | null {
  if (semesters.length === 0) return null;

  const today = new Date();
  const current = semesters.find(
    (s) =>
      s.startDate &&
      s.endDate &&
      isWithinInterval(today, { start: new Date(s.startDate), end: new Date(s.endDate) }),
  );
  if (current) return current.entity.id;

  return [...semesters].sort((a, b) => b.entity.createdAt.localeCompare(a.entity.createdAt))[0]
    .entity.id;
}
