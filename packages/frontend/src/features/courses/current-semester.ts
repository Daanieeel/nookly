import type { Semester } from "#/lib/api/types.ts";
import { semesterSortKey, todaySortKey } from "./academic-terms";

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
export function resolveActiveSemesterId(semesters: Semester[]): string | null {
  if (semesters.length === 0) return null;

  const manual = semesters.find((s) => s.isCurrent);
  if (manual) return manual.entity.id;

  const todayKey = todaySortKey();
  const started = semesters
    .map((s) => ({ semester: s, key: semesterSortKey(s) }))
    .filter((x): x is { semester: Semester; key: number } => x.key !== null && x.key <= todayKey)
    .sort((a, b) => b.key - a.key);
  if (started.length > 0) return started[0].semester.entity.id;

  return [...semesters].sort((a, b) => b.entity.createdAt.localeCompare(a.entity.createdAt))[0]
    .entity.id;
}

/// Chronological display order (PLAN §2) — a manual drag-reorder
/// (`manualPosition`) always wins over the computed `termType`/`year` order;
/// Semesters missing both sort last, in creation order.
export function orderSemesters(semesters: Semester[]): Semester[] {
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
