import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace, trashEntity } from "./entities.ts";
import { getEntity } from "./entities.ts";
import { listBlocks } from "./notes.ts";
import {
  courseSemester,
  courseSemesters,
  createSemester,
  currentSemesterId,
  getOrCreateCourseNotes,
  getOrCreateSemesterNotes,
  gradeReport,
  itemWeights,
  listSemesters,
  reorderSemesters,
  rollUpGrades,
  setCourseSemester,
  setCurrentSemester,
  updateSemester,
} from "./semesters.ts";
import {
  createAssignment,
  createCourse,
  createExam,
  updateAssignment,
  updateExam,
} from "./study.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let space: string;

beforeEach(async () => {
  db = testDb();
  space = await createSpace(db, "Uni", "#3b82f6");
});

describe("semesters", () => {
  it("orders by term and year, a manual order wins, and exactly one is current", async () => {
    const winter = await createSemester(db, space, {
      title: "WS 25/26",
      termType: "winter",
      year: 2025,
    });
    const summer = await createSemester(db, space, {
      title: "SS 25",
      termType: "summer",
      year: 2025,
    });
    const blank = await createSemester(db, space, { title: "Someday" });
    // Summer 2025 starts in April, winter 2025 in October; blank sorts last.
    expect((await listSemesters(db, space)).map((s) => s.entity.id)).toEqual([
      summer,
      winter,
      blank,
    ]);
    await reorderSemesters(db, [blank, winter, summer]);
    expect((await listSemesters(db, space)).map((s) => s.entity.id)).toEqual([
      blank,
      winter,
      summer,
    ]);
    await setCurrentSemester(db, space, winter);
    await setCurrentSemester(db, space, summer);
    const all = await listSemesters(db, space);
    expect(all.filter((s) => s.isCurrent).map((s) => s.entity.id)).toEqual([summer]);
    expect(currentSemesterId(all)).toBe(summer);
  });

  it("changes only the fields given", async () => {
    const id = await createSemester(db, space, {
      title: "S",
      termType: "summer",
      year: 2025,
      startDate: "2025-04-15",
      endDate: "2025-07-15",
    });
    await updateSemester(db, id, { endDate: "2025-07-20", year: 2026 });
    expect((await listSemesters(db, space))[0]).toMatchObject({
      termType: "summer",
      year: 2026,
      startDate: "2025-04-15",
      endDate: "2025-07-20",
    });
  });

  it("puts a course in one semester at a time, or none", async () => {
    const a = await createSemester(db, space, { title: "A" });
    const b = await createSemester(db, space, { title: "B" });
    const course = await createCourse(db, space, "Algorithms");
    await setCourseSemester(db, course, a);
    await setCourseSemester(db, course, b);
    expect(await courseSemester(db, course)).toBe(b);
    await setCourseSemester(db, course, null);
    expect(await courseSemester(db, course)).toBeNull();
  });

  it("makes its notes page once, named after it", async () => {
    const semester = await createSemester(db, space, { title: "WS 25/26" });
    const note = await getOrCreateSemesterNotes(db, semester);
    expect(await getOrCreateSemesterNotes(db, semester)).toBe(note);
    expect(await getEntity(db, note)).toMatchObject({ type: "note", title: "WS 25/26 Notes" });
    const course = await createCourse(db, space, "Algorithms");
    const notes = await getOrCreateCourseNotes(db, course);
    expect(await getEntity(db, notes)).toMatchObject({
      type: "course_notes",
      title: "Algorithms Notes",
    });
    expect(await listBlocks(db, notes)).toHaveLength(1);
  });
});

describe("the semester of every course", () => {
  it("lists them at once and leaves out courses with none and trashed ones", async () => {
    const a = await createSemester(db, space, { title: "A" });
    const inA = await createCourse(db, space, "In A");
    const gone = await createCourse(db, space, "Gone");
    await createCourse(db, space, "Loose");
    await setCourseSemester(db, inA, a);
    await setCourseSemester(db, gone, a);
    await trashEntity(db, gone);
    expect(await courseSemesters(db, space)).toEqual(new Map([[inA, a]]));
  });
});

describe("grades", () => {
  it("shares the weight as the desktop does: given ones as given, the rest evenly", () => {
    expect(itemWeights([{ weight: 0.5 }, { weight: null }, { weight: null }])).toEqual([
      0.5, 0.25, 0.25,
    ]);
    expect(itemWeights([{ weight: 60 }, { weight: 40 }])).toEqual([0.6, 0.4]);
    expect(itemWeights([{ weight: null }, { weight: null }])).toEqual([0.5, 0.5]);
    expect(itemWeights([{ weight: 0.8 }, { weight: 0.8 }, { weight: null }])).toEqual([
      0.8, 0.8, 0,
    ]);
  });

  it("rolls a course up from what is graded", () => {
    expect(
      rollUpGrades([
        { weight: 0.5, grade: 1 },
        { weight: 0.5, grade: null },
      ]),
    ).toEqual({
      grade: 1,
      gradedWeight: 0.5,
      gradedCount: 1,
      itemCount: 2,
    });
    expect(rollUpGrades([]).grade).toBeNull();
  });

  async function graded(course: string, grade: number, weight: number | null = null) {
    const exam = await createExam(db, space, "Exam", course, "2026-02-01");
    await updateExam(db, exam, { grade, weight });
  }

  it("groups courses by semester with an average each, and the cumulative one over courses", async () => {
    const algo = await createCourse(db, space, "Algorithms");
    const logic = await createCourse(db, space, "Logic");
    const physics = await createCourse(db, space, "Physics");
    const ws = await createSemester(db, space, { title: "WS" });
    const ss = await createSemester(db, space, { title: "SS" });
    await setCourseSemester(db, algo, ws);
    await setCourseSemester(db, logic, ws);
    await setCourseSemester(db, physics, ss);
    await graded(algo, 1);
    await graded(logic, 2);
    await graded(physics, 4);
    const report = await gradeReport(db, space);
    expect(
      report.semesters.map((g) => [g.semester?.entity.id, g.gpa, g.gradedCourseCount]),
    ).toEqual([
      [ws, 1.5, 2],
      [ss, 4, 1],
    ]);
    // A mean of the three courses, not of the two semester averages.
    expect(report.gpa).toBe((1 + 2 + 4) / 3);
  });

  it("lists loose courses last, ungraded ones without counting them, and nothing graded as no average", async () => {
    const loose = await createCourse(db, space, "Loose");
    const tied = await createCourse(db, space, "Tied");
    const empty = await createCourse(db, space, "Empty");
    const ws = await createSemester(db, space, { title: "WS" });
    await setCourseSemester(db, tied, ws);
    await graded(loose, 3);
    await createExam(db, space, "Later", empty);
    const report = await gradeReport(db, space);
    expect(report.semesters.map((g) => g.semester?.entity.id ?? null)).toEqual([ws, null]);
    const group = report.semesters[1];
    expect(group.courses.map((c) => c.course.title)).toEqual(["Loose", "Empty"]);
    expect(group.gpa).toBe(3);
    expect(group.gradedCourseCount).toBe(1);
    expect(group.courses[1].grades.grade).toBeNull();
    expect((await gradeReport(db, await createSpace(db, "Other", "#000000"))).gpa).toBeNull();
  });

  it("puts exams and assignments in a course by date, with their share of its grade", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const exam = await createExam(db, space, "Final", course, "2026-02-01");
    await updateExam(db, exam, { weight: 0.6, grade: 1 });
    const sheet = await createAssignment(db, space, "Sheet", course, "2026-01-15");
    await updateAssignment(db, sheet, { status: "graded", grade: 3 });
    const [group] = (await gradeReport(db, space)).semesters;
    const items = group.courses[0].items;
    expect(items.map((i) => [i.kind, i.share])).toEqual([
      ["assignment", 0.4],
      ["exam", 0.6],
    ]);
    expect(group.courses[0].grades.grade).toBeCloseTo(0.6 * 1 + 0.4 * 3);
  });

  it("leaves out trashed courses", async () => {
    const course = await createCourse(db, space, "Gone");
    await graded(course, 1);
    await trashEntity(db, course);
    expect((await gradeReport(db, space)).semesters).toEqual([]);
  });
});
