import { beforeEach, describe, expect, it } from "vitest";
import { NodeSqliteDriver } from "../sync/testing/node-driver.ts";
import type { LocalDb } from "./db.ts";
import { createSpace, spaceModules } from "./entities.ts";
import {
  attachLabel,
  createLabel,
  detachLabel,
  entityLabels,
  listLabels,
  relate,
  relatedItems,
  unrelate,
} from "./links.ts";
import {
  createAssignment,
  createCard,
  createCourse,
  createDeck,
  createExam,
  deleteCard,
  getAssignment,
  getCourse,
  getDeck,
  getExam,
  listAssignments,
  listCards,
  listExams,
  reviewCard,
  setCourseRoom,
  undoReview,
  setAssignmentCourse,
  setAssignmentDueDate,
  setCourseProfessor,
  setDeckExam,
  setExamCourse,
  studyQueue,
  updateAssignment,
  updateExam,
} from "./study.ts";
import { createTask } from "./tasks.ts";
import { trashEntity } from "./entities.ts";

let driver: NodeSqliteDriver;
let db: LocalDb;
let clock: number;
let ids = 0;

beforeEach(() => {
  driver = new NodeSqliteDriver();
  clock = Date.parse("2026-10-14T09:00:00Z");
  db = {
    driver,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    now: () => new Date((clock += 1000)),
  };
});

describe("courses, exams and assignments", () => {
  it("files exams and assignments under a course and moves them", async () => {
    const space = await createSpace(db, "Uni", "#3b82f6");
    const algo = await createCourse(db, space, "Algorithms");
    const math = await createCourse(db, space, "Calculus");
    await setCourseProfessor(db, algo, "  Prof. Knuth ");
    expect((await getCourse(db, algo))?.professor).toBe("Prof. Knuth");
    await setCourseProfessor(db, algo, " ");
    expect((await getCourse(db, algo))?.professor).toBeNull();

    const exam = await createExam(db, space, "Final", algo, "2027-02-10");
    await updateExam(db, exam, { examTime: "09:30", room: " H 0104 ", weight: 0.6 });
    await updateExam(db, exam, { status: "studying", grade: 1.7 });
    expect(await getExam(db, exam)).toMatchObject({
      courseId: algo,
      examDate: "2027-02-10",
      examTime: "09:30",
      room: "H 0104",
      weight: 0.6,
      grade: 1.7,
      status: "studying",
    });
    await setExamCourse(db, exam, math);
    expect((await listExams(db, { courseId: algo })).length).toBe(0);
    expect((await listExams(db, { courseId: math })).map((e) => e.entity.id)).toEqual([exam]);
    expect(
      driver.rows(
        "SELECT COUNT(*) AS n FROM relationships WHERE relationship_type = 'exam-course'",
      ),
    ).toEqual([{ n: 1 }]);

    const sheet = await createAssignment(db, space, "Sheet 1", algo);
    expect((await getAssignment(db, sheet))?.status).toBe("not_started");
    driver.rows("UPDATE assignments SET due_session_offset_days = 2 WHERE entity_id = ?", sheet);
    await setAssignmentDueDate(db, sheet, "2026-11-01");
    await updateAssignment(db, sheet, { status: "graded", grade: 1.3, weight: 0.1 });
    await setAssignmentCourse(db, sheet, math);
    expect(await getAssignment(db, sheet)).toMatchObject({
      courseId: math,
      dueDate: "2026-11-01",
      dueSessionOffsetDays: null,
      status: "graded",
      grade: 1.3,
      weight: 0.1,
    });
    expect((await listAssignments(db, { spaceId: space })).length).toBe(1);
    // Exams and Assignments bring the Grades module along, like on the desktop.
    expect(await spaceModules(db, space)).toEqual([
      "courses",
      "semesters",
      "exams",
      "grades",
      "assignments",
    ]);
  });
});

describe("decks", () => {
  it("studies new cards first, schedules them and logs each review", async () => {
    const space = await createSpace(db, "Uni", "#3b82f6");
    const course = await createCourse(db, space, "Algorithms");
    const exam = await createExam(db, space, "Final", course);
    const deck = await createDeck(db, space, "Sorting", exam);
    const a = await createCard(db, deck, "Quicksort average?", "n log n");
    const b = await createCard(db, deck, "Merge sort stable?", "Yes");
    const gone = await createCard(db, deck, "Old", "card");
    await deleteCard(db, gone);
    expect((await getDeck(db, deck))?.examId).toBe(exam);
    expect((await getDeck(db, deck))?.stats).toEqual({ total: 2, new: 2, learning: 0, due: 0 });

    await reviewCard(db, a, "good");
    const cards = await listCards(db, deck);
    const reviewed = cards.find((c) => c.id === a);
    expect(reviewed).toMatchObject({ state: "learning", reps: 1, scheduledDays: 0 });
    // A learning card due in ten minutes waits behind the new one.
    expect(studyQueue(cards, clock).map((c) => c.id)).toEqual([b]);
    expect(studyQueue(cards, clock + 11 * 60_000).map((c) => c.id)).toEqual([a, b]);

    const [log] = driver.rows("SELECT rating, state, previous FROM index_card_reviews");
    expect(log.rating).toBe("good");
    expect(log.state).toBe("new");
    expect(JSON.parse(String(log.previous))).toMatchObject({ state: "new", reps: 0 });

    await setDeckExam(db, deck, null);
    expect((await getDeck(db, deck))?.examId).toBeNull();
  });
});

describe("undoing a review", () => {
  it("puts the card back the way it was and drops that review, one at a time", async () => {
    const space = await createSpace(db, "Uni", "#3b82f6");
    const deck = await createDeck(db, space, "Sorting");
    const card = await createCard(db, deck, "Quicksort average?", "n log n");
    await reviewCard(db, card, "good");
    const afterFirst = (await listCards(db, deck))[0];
    clock += 60_000;
    await reviewCard(db, card, "again");
    await undoReview(db, card);
    expect((await listCards(db, deck))[0]).toMatchObject({
      state: afterFirst.state,
      reps: afterFirst.reps,
      stability: afterFirst.stability,
      dueAt: afterFirst.dueAt,
    });
    expect(driver.rows("SELECT id FROM index_card_reviews")).toHaveLength(1);
    await undoReview(db, card);
    expect((await listCards(db, deck))[0]).toMatchObject({ state: "new", reps: 0 });
    await expect(undoReview(db, card)).rejects.toThrow("no review to undo");
  });
});

describe("related items and labels", () => {
  it("links two items once, either way round, and drops trashed ones", async () => {
    const space = await createSpace(db, "Work", "#3b82f6");
    const a = await createTask(db, space, "A");
    const b = await createTask(db, space, "B");
    const c = await createTask(db, space, "C");
    await relate(db, a, b);
    await relate(db, b, a);
    await relate(db, c, a);
    expect((await relatedItems(db, a)).map((r) => r.entity.title)).toEqual(["B", "C"]);
    expect((await relatedItems(db, b)).map((r) => r.entity.title)).toEqual(["A"]);
    await trashEntity(db, c);
    const [link] = await relatedItems(db, a);
    expect(link.entity.title).toBe("B");
    await unrelate(db, link.relationshipId);
    expect(await relatedItems(db, b)).toEqual([]);
  });

  it("keeps label names unique per Space and never crosses Spaces", async () => {
    const work = await createSpace(db, "Work", "#3b82f6");
    const home = await createSpace(db, "Home", "#22c55e");
    const task = await createTask(db, work, "Report");
    const urgent = await createLabel(db, work, " Urgent ");
    expect(await createLabel(db, work, "urgent")).toBe(urgent);
    const elsewhere = await createLabel(db, home, "Urgent");
    expect(elsewhere).not.toBe(urgent);
    await attachLabel(db, task, urgent);
    await attachLabel(db, task, urgent);
    await attachLabel(db, task, elsewhere);
    expect((await entityLabels(db, task)).map((l) => l.id)).toEqual([urgent]);
    expect((await listLabels(db, work)).map((l) => l.name)).toEqual(["Urgent"]);
    await detachLabel(db, task, urgent);
    expect(await entityLabels(db, task)).toEqual([]);
  });
});

describe("a course's room", () => {
  it("is set, cleared, and read with the professor", async () => {
    const space = await createSpace(db, "Uni", "#3b82f6");
    const course = await createCourse(db, space, "Algorithms");
    await setCourseProfessor(db, course, "Prof. Ada");
    await setCourseRoom(db, course, "  H 0104 ");
    expect(await getCourse(db, course)).toMatchObject({ professor: "Prof. Ada", room: "H 0104" });
    await setCourseRoom(db, course, "  ");
    expect((await getCourse(db, course))?.room).toBeNull();
  });
});
