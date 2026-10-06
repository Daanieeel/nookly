import { orderSemesters, resolveActiveSemesterId } from "#/features/courses/current-semester.ts";
import { z } from "zod";
import type { GradeItem, GradeReport, SemesterReport } from "#/lib/api/types.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

/// Up to two decimals, so a 1.7 stays 1.7 and a 1.5333 becomes 1.53.
export function formatGrade(grade: number | null): string {
  return grade === null ? "No grade" : String(Math.round(grade * 100) / 100);
}

/// A share of a course's grade, 0 to 1, as a whole percentage.
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function groupTitle(group: SemesterReport): string {
  return group.semester ? group.semester.entity.title.trim() || "Untitled" : "No semester";
}

export function groupKey(group: SemesterReport): string {
  return group.semester?.entity.id ?? "none";
}

/// The report's groups in the Semesters page's order, the courses without a semester last.
export function orderedGroups(report: GradeReport): SemesterReport[] {
  const loose = report.semesters.filter((group) => group.semester === null);
  const byId = new Map(
    report.semesters.flatMap((group) =>
      group.semester ? [[groupKey(group), group] as const] : [],
    ),
  );
  const ordered = orderSemesters([...byId.values()].flatMap((group) => group.semester ?? []));
  return [...ordered.flatMap((s) => byId.get(s.entity.id) ?? []), ...loose];
}

/// The group of the current semester, by the same rule as the Semesters page.
export function currentGroup(report: GradeReport): SemesterReport | null {
  const semesters = report.semesters.flatMap((group) => group.semester ?? []);
  const id = resolveActiveSemesterId(semesters);
  return report.semesters.find((group) => group.semester?.entity.id === id) ?? null;
}

/// Work in the order it happens, undated work last.
export function byDate(items: GradeItem[]): GradeItem[] {
  const key = (item: GradeItem) => item.date ?? "\uffff";
  return items.toSorted((a, b) => key(a).localeCompare(key(b)));
}

/// The averages of the semesters that have one, oldest first, for the trend line.
export function trend(groups: SemesterReport[]): { title: string; gpa: number }[] {
  return groups.flatMap((group) =>
    group.semester && group.gpa !== null ? [{ title: groupTitle(group), gpa: group.gpa }] : [],
  );
}

const openSemestersSchema = z.record(z.string(), z.boolean());

/// Opened and closed semesters by `groupKey`, as last picked on this device.
export type OpenSemesters = z.infer<typeof openSemestersSchema>;

/// The last pick, or else only the current semester open, and every one when none is.
export function startsOpen(
  group: SemesterReport,
  current: SemesterReport | null,
  saved: OpenSemesters,
): boolean {
  return saved[groupKey(group)] ?? (current === null || group === current);
}

export function readOpenSemesters(): OpenSemesters {
  try {
    const raw = preferences.get(STORAGE_KEYS.gradeSemesters);
    const parsed = raw ? openSemestersSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveOpenSemester(key: string, open: boolean) {
  const next = { ...readOpenSemesters(), [key]: open };
  preferences.set(STORAGE_KEYS.gradeSemesters, JSON.stringify(next));
}
