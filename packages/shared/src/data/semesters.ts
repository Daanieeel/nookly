import { type SemesterLike, orderSemesters, resolveActiveSemesterId } from "../academic.ts";
import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";
import { createPage } from "./notes.ts";
import {
  type AssignmentRecord,
  type ExamRecord,
  listAssignments,
  listCourses,
  listExams,
} from "./study.ts";

/// Semesters, a course's place in one, the notes pages that belong to them, and the
/// grade report (`db/courses.rs`, `db/grade_report.rs`).

export interface SemesterRecord extends SemesterLike {
  entity: EntityRecord;
  startDate: string | null;
  endDate: string | null;
  termType: string | null;
  year: number | null;
  isCurrent: boolean;
  manualPosition: number | null;
}

const SEMESTER_SELECT = `SELECT ${ENTITY_COLUMNS}, s.start_date, s.end_date, s.term_type, s.year, s.is_current, s.manual_position
  FROM entities e JOIN semesters s ON s.entity_id = e.id`;

function toSemester(r: Record<string, string | number | null>): SemesterRecord {
  return {
    entity: toEntity(r),
    startDate: optStr(r.start_date),
    endDate: optStr(r.end_date),
    termType: optStr(r.term_type),
    year: r.year === null ? null : num(r.year),
    isCurrent: num(r.is_current) !== 0,
    manualPosition: r.manual_position === null ? null : num(r.manual_position),
  };
}

/// A Space's semesters (or every Space's), in the order the Semesters page shows them.
export async function listSemesters(db: LocalDb, spaceId?: string): Promise<SemesterRecord[]> {
  const found = (
    await rows(
      db,
      `${SEMESTER_SELECT} WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL${spaceId ? " AND e.space_id = ?" : ""} ORDER BY e.created_at`,
      ...(spaceId ? [spaceId] : []),
    )
  ).map(toSemester);
  return orderSemesters(found);
}

export async function getSemester(db: LocalDb, id: string): Promise<SemesterRecord | null> {
  const row = await first(db, `${SEMESTER_SELECT} WHERE e.id = ?`, id);
  return row ? toSemester(row) : null;
}

/// The semester a Space is in now: the one flagged current, else by the term and year.
export function currentSemesterId(semesters: SemesterRecord[]): string | null {
  return resolveActiveSemesterId(semesters);
}

export async function createSemester(
  db: LocalDb,
  spaceId: string,
  input: {
    title: string;
    startDate?: string | null;
    endDate?: string | null;
    termType?: string | null;
    year?: number | null;
  },
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "semester", input.title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO semesters (entity_id, start_date, end_date, term_type, year) VALUES (?, ?, ?, ?, ?)",
      params: [
        id,
        input.startDate ?? null,
        input.endDate ?? null,
        input.termType ?? null,
        input.year ?? null,
      ],
    },
  ]);
  return id;
}

/// `update_semester`: only the fields given change.
export async function updateSemester(
  db: LocalDb,
  id: string,
  patch: { startDate?: string; endDate?: string; termType?: string; year?: number },
): Promise<void> {
  const columns: [string, string | number | undefined][] = [
    ["start_date", patch.startDate],
    ["end_date", patch.endDate],
    ["term_type", patch.termType],
    ["year", patch.year],
  ];
  const set = columns.filter(([, value]) => value !== undefined);
  if (set.length === 0) return;
  await write(db, [
    {
      sql: `UPDATE semesters SET ${set.map(([c]) => `${c} = ?`).join(", ")} WHERE entity_id = ?`,
      params: [...set.map(([, value]) => value ?? null), id],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// `set_current_semester`: this one, and no other of its Space.
export async function setCurrentSemester(db: LocalDb, spaceId: string, id: string): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE semesters SET is_current = 0 WHERE entity_id IN (SELECT id FROM entities WHERE space_id = ?)",
      params: [spaceId],
    },
    { sql: "UPDATE semesters SET is_current = 1 WHERE entity_id = ?", params: [id] },
  ]);
}

/// `reorder_semesters`: every id in its new order.
export async function reorderSemesters(db: LocalDb, ids: string[]): Promise<void> {
  await write(
    db,
    ids.map((id, position) => ({
      sql: "UPDATE semesters SET manual_position = ? WHERE entity_id = ?",
      params: [position, id],
    })),
  );
}

/// The semester a course runs in, if any.
export async function courseSemester(db: LocalDb, courseId: string): Promise<string | null> {
  const row = await first(
    db,
    "SELECT to_entity_id FROM relationships WHERE from_entity_id = ? AND relationship_type = 'course-semester'",
    courseId,
  );
  return row ? str(row.to_entity_id) : null;
}

/// `set_course_semester`: a course has one semester at a time, so the old link goes first.
/// `null` takes the course out of its semester.
export async function setCourseSemester(
  db: LocalDb,
  courseId: string,
  semesterId: string | null,
): Promise<void> {
  await write(db, [
    {
      sql: "DELETE FROM relationships WHERE from_entity_id = ? AND relationship_type = 'course-semester'",
      params: [courseId],
    },
    ...(semesterId
      ? [
          {
            sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'course-semester', ?)",
            params: [db.newId(), courseId, semesterId, iso(db)],
          },
        ]
      : []),
  ]);
}

/// A semester's own notes page, made on first use (a real note, listed with the others).
export async function getOrCreateSemesterNotes(db: LocalDb, semesterId: string): Promise<string> {
  const existing = await first(
    db,
    "SELECT to_entity_id FROM relationships WHERE from_entity_id = ? AND relationship_type = 'semester-notes'",
    semesterId,
  );
  if (existing) return str(existing.to_entity_id);
  const semester = await first(db, "SELECT space_id, title FROM entities WHERE id = ?", semesterId);
  if (!semester) throw new Error("This semester isn't here anymore.");
  const title = str(semester.title).trim() ? `${str(semester.title)} Notes` : "Semester Notes";
  const note = await createPage(db, str(semester.space_id), "note", title);
  await write(db, [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'semester-notes', ?)",
      params: [db.newId(), semesterId, note, iso(db)],
    },
  ]);
  return note;
}

/// A course's notes page (type `course_notes`, shown on the course and nowhere else).
export async function getOrCreateCourseNotes(db: LocalDb, courseId: string): Promise<string> {
  const existing = await first(
    db,
    "SELECT to_entity_id FROM relationships WHERE from_entity_id = ? AND relationship_type = 'course-note'",
    courseId,
  );
  if (existing) return str(existing.to_entity_id);
  const course = await first(db, "SELECT space_id, title FROM entities WHERE id = ?", courseId);
  if (!course) throw new Error("This course isn't here anymore.");
  const title = str(course.title).trim() ? `${str(course.title)} Notes` : "Course Notes";
  const note = await createPage(db, str(course.space_id), "course_notes", title);
  await write(db, [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'course-note', ?)",
      params: [db.newId(), courseId, note, iso(db)],
    },
  ]);
  return note;
}

// --- grades -----------------------------------------------------------------------

export interface CourseGrades {
  /// The weighted mean of the graded items; null until something with weight is graded.
  grade: number | null;
  /// The graded share of the course's total weight, 0 to 1.
  gradedWeight: number;
  gradedCount: number;
  itemCount: number;
}

/// What share each item counts for, 0 to 1, in the same order. An exam with a weight
/// counts for exactly that share; the rest split what is left evenly, so a course with
/// no weights is a plain mean. Weights above 1 are read as percentages.
export function itemWeights(items: { weight: number | null }[]): number[] {
  const given = items.map(({ weight }) =>
    weight !== null && weight >= 0 ? (weight > 1 ? weight / 100 : weight) : null,
  );
  const fixed = given.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const open = given.filter((w) => w === null).length;
  const share = open > 0 ? Math.max(0, 1 - fixed) / open : 0;
  return given.map((w) => w ?? share);
}

export function rollUpGrades(
  items: { weight: number | null; grade: number | null }[],
): CourseGrades {
  const weights = itemWeights(items);
  let total = 0;
  let graded = 0;
  let sum = 0;
  let gradedCount = 0;
  items.forEach((item, index) => {
    total += weights[index];
    if (item.grade !== null) {
      graded += weights[index];
      sum += weights[index] * item.grade;
      gradedCount += 1;
    }
  });
  return {
    grade: graded > 0 ? sum / graded : null,
    gradedWeight: total > 0 ? graded / total : 0,
    gradedCount,
    itemCount: items.length,
  };
}

export interface GradeItem {
  entity: EntityRecord;
  kind: "exam" | "assignment";
  weight: number | null;
  /// The share of the course's grade it counts for, 0 to 1.
  share: number;
  grade: number | null;
  status: string;
  date: string | null;
}

export interface CourseReport {
  course: EntityRecord;
  grades: CourseGrades;
  items: GradeItem[];
}

export interface SemesterReport {
  /// Null for the courses that are in no semester.
  semester: SemesterRecord | null;
  gpa: number | null;
  gradedCourseCount: number;
  courses: CourseReport[];
}

export interface GradeReport {
  semesters: SemesterReport[];
  gpa: number | null;
}

const mean = (values: number[]) =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

async function links(db: LocalDb, type: string): Promise<Map<string, string>> {
  return new Map(
    (
      await rows(
        db,
        "SELECT from_entity_id, to_entity_id FROM relationships WHERE relationship_type = ?",
        type,
      )
    ).map((r) => [str(r.from_entity_id), str(r.to_entity_id)]),
  );
}

/// `get_grade_report`: every course's grade and the work behind it, by semester, with the
/// average of each and of all. Computed, never stored.
export async function gradeReport(db: LocalDb, spaceId: string): Promise<GradeReport> {
  const courses = await listCourses(db, spaceId);
  const semesters = await listSemesters(db, spaceId);
  const semesterOf = await links(db, "course-semester");
  const items = new Map<string, GradeItem[]>();
  const add = (courseId: string | null, item: GradeItem) => {
    if (courseId) items.set(courseId, [...(items.get(courseId) ?? []), item]);
  };
  for (const exam of await listExams(db, { spaceId })) add(exam.courseId, toItem(exam, "exam"));
  for (const work of await listAssignments(db, { spaceId }))
    add(work.courseId, toItem(work, "assignment"));
  const reports = courses.map<CourseReport>(({ entity }) => {
    const mine = items.get(entity.id) ?? [];
    const weights = itemWeights(mine);
    const total = weights.reduce((a, b) => a + b, 0);
    const shared = mine.map((item, index) => ({
      ...item,
      share: total > 0 ? weights[index] / total : 0,
    }));
    // Dated work first, by date; the sort is stable, so equal dates keep their order.
    shared.sort((a, b) =>
      a.date === null
        ? b.date === null
          ? 0
          : 1
        : b.date === null
          ? -1
          : a.date.localeCompare(b.date),
    );
    return { course: entity, grades: rollUpGrades(mine), items: shared };
  });
  const group = (semester: SemesterRecord | null): SemesterReport => ({
    semester,
    gpa: null,
    gradedCourseCount: 0,
    courses: [],
  });
  const groups = [...semesters.map(group), group(null)];
  for (const report of reports.sort((a, b) =>
    a.course.createdAt.localeCompare(b.course.createdAt),
  )) {
    const id = semesterOf.get(report.course.id);
    // In no semester, or in one that is in Trash.
    const group =
      groups.find((g) => g.semester !== null && g.semester.entity.id === id) ??
      groups[groups.length - 1];
    group.courses.push(report);
  }
  const shown = groups
    .filter((g) => g.courses.length > 0)
    .map((g) => {
      const graded = g.courses.flatMap((c) => (c.grades.grade === null ? [] : [c.grades.grade]));
      return { ...g, gpa: mean(graded), gradedCourseCount: graded.length };
    });
  return {
    semesters: shown,
    gpa: mean(
      shown.flatMap((g) =>
        g.courses.flatMap((c) => (c.grades.grade === null ? [] : [c.grades.grade])),
      ),
    ),
  };
}

function toItem(source: ExamRecord | AssignmentRecord, kind: GradeItem["kind"]): GradeItem {
  return {
    entity: source.entity,
    kind,
    weight: source.weight,
    share: 0,
    grade: source.grade,
    status: source.status,
    date: "examDate" in source ? source.examDate : source.dueDate,
  };
}
