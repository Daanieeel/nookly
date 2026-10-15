import { z } from "zod";
import type { SqlValue } from "../schema.ts";
import type { SqlStatement } from "../sync/sql.ts";
import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";
import {
  type CardState,
  type NextDue,
  type Rating,
  type Schedule,
  preview,
  review,
} from "./fsrs.ts";

/// Courses, Exams, Assignments and Decks with their Index Cards, written as the
/// desktop's `db::courses`, `db::exams`, `db::assignments` and `db::decks` write them.

type Row = Record<string, SqlValue>;
const optNum = (value: SqlValue | undefined) =>
  value === null || value === undefined ? null : Number(value);
/// Trims, and stores blank as unset, like the desktop's `clean_text`.
const clean = (value: string | null) => value?.trim() || null;

/// Replaces the one link of `type` from `fromId` (exam to course, deck to exam, ...).
function relink(db: LocalDb, fromId: string, type: string, toId: string | null): SqlStatement[] {
  const statements: SqlStatement[] = [
    {
      sql: "DELETE FROM relationships WHERE from_entity_id = ? AND relationship_type = ?",
      params: [fromId, type],
    },
  ];
  if (toId) {
    statements.push({
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [db.newId(), fromId, toId, type, iso(db)],
    });
  }
  return statements;
}

/// The other end of an entity's one link of `type`, as a column of a query.
const linkedTo = (type: string) =>
  `(SELECT r.to_entity_id FROM relationships r WHERE r.from_entity_id = e.id AND r.relationship_type = '${type}' LIMIT 1)`;

const live = "e.deleted_at IS NULL AND e.hidden_at IS NULL";

function spaceFilter(spaceId?: string): { where: string; params: SqlValue[] } {
  return spaceId ? { where: " AND e.space_id = ?", params: [spaceId] } : { where: "", params: [] };
}

async function update(
  db: LocalDb,
  table: string,
  id: string,
  patch: Record<string, SqlValue | undefined>,
): Promise<void> {
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (fields.length === 0) return;
  await write(db, [
    {
      sql: `UPDATE ${table} SET ${fields.map(([name]) => `${name} = ?`).join(", ")} WHERE entity_id = ?`,
      params: [...fields.map(([, value]) => value ?? null), id],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// A weight as a whole percentage. Weight is stored as a fraction (`0.2`); older whole
/// numbers are percentages.
export function weightPercent(weight: number | null): number | null {
  if (weight === null) return null;
  return Math.round(weight <= 1 ? weight * 100 : weight);
}

// --- Courses ---------------------------------------------------------------

export interface CourseRecord {
  entity: EntityRecord;
  professor: string | null;
  room: string | null;
}

export async function listCourses(db: LocalDb, spaceId?: string): Promise<CourseRecord[]> {
  const filter = spaceFilter(spaceId);
  return (
    await rows(
      db,
      `SELECT ${ENTITY_COLUMNS}, c.professor, c.room FROM entities e JOIN courses c ON c.entity_id = e.id
       WHERE ${live}${filter.where} ORDER BY e.created_at`,
      ...filter.params,
    )
  ).map((r) => ({ entity: toEntity(r), professor: optStr(r.professor), room: optStr(r.room) }));
}

export async function getCourse(db: LocalDb, id: string): Promise<CourseRecord | null> {
  const row = await first(
    db,
    `SELECT ${ENTITY_COLUMNS}, c.professor, c.room FROM entities e JOIN courses c ON c.entity_id = e.id WHERE e.id = ?`,
    id,
  );
  return row
    ? { entity: toEntity(row), professor: optStr(row.professor), room: optStr(row.room) }
    : null;
}

export async function createCourse(db: LocalDb, spaceId: string, title: string): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "course", title);
  await write(db, [
    ...statements,
    { sql: "INSERT INTO courses (entity_id) VALUES (?)", params: [id] },
  ]);
  return id;
}

export async function setCourseProfessor(
  db: LocalDb,
  id: string,
  professor: string | null,
): Promise<void> {
  await update(db, "courses", id, { professor: clean(professor) });
}

export async function setCourseRoom(db: LocalDb, id: string, room: string | null): Promise<void> {
  await update(db, "courses", id, { room: clean(room) });
}

// --- Exams -----------------------------------------------------------------

export interface ExamRecord {
  entity: EntityRecord;
  courseId: string | null;
  examDate: string | null;
  examTime: string | null;
  room: string | null;
  weight: number | null;
  grade: number | null;
  status: string;
}

const EXAM_SELECT = `SELECT ${ENTITY_COLUMNS}, x.exam_date, x.exam_time, x.room, x.weight, x.grade, x.status,
  ${linkedTo("exam-course")} AS course_id FROM entities e JOIN exams x ON x.entity_id = e.id`;

function toExam(r: Row): ExamRecord {
  return {
    entity: toEntity(r),
    courseId: optStr(r.course_id),
    examDate: optStr(r.exam_date),
    examTime: optStr(r.exam_time),
    room: optStr(r.room),
    weight: optNum(r.weight),
    grade: optNum(r.grade),
    status: str(r.status),
  };
}

/// Exams of a Space, or of every Space, soonest first and undated last.
export async function listExams(
  db: LocalDb,
  query: { spaceId?: string; courseId?: string } = {},
): Promise<ExamRecord[]> {
  const filter = spaceFilter(query.spaceId);
  const byCourse = query.courseId ? ` AND ${linkedTo("exam-course")} = ?` : "";
  return (
    await rows(
      db,
      `${EXAM_SELECT} WHERE ${live}${filter.where}${byCourse} ORDER BY x.exam_date IS NULL, x.exam_date, x.exam_time`,
      ...filter.params,
      ...(query.courseId ? [query.courseId] : []),
    )
  ).map(toExam);
}

export async function getExam(db: LocalDb, id: string): Promise<ExamRecord | null> {
  const row = await first(db, `${EXAM_SELECT} WHERE e.id = ?`, id);
  return row ? toExam(row) : null;
}

/// `create_exam`: upcoming, in its Course.
export async function createExam(
  db: LocalDb,
  spaceId: string,
  title: string,
  courseId: string,
  examDate: string | null = null,
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "exam", title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO exams (entity_id, exam_date, weight, grade, status) VALUES (?, ?, NULL, NULL, 'upcoming')",
      params: [id, examDate],
    },
    ...relink(db, id, "exam-course", courseId),
  ]);
  return id;
}

export interface ExamPatch {
  examDate?: string | null;
  examTime?: string | null;
  room?: string | null;
  weight?: number | null;
  grade?: number | null;
  status?: string;
}

export async function updateExam(db: LocalDb, id: string, patch: ExamPatch): Promise<void> {
  await update(db, "exams", id, {
    exam_date: patch.examDate,
    exam_time: patch.examTime,
    room: patch.room === undefined ? undefined : clean(patch.room),
    weight: patch.weight,
    grade: patch.grade,
    status: patch.status,
  });
}

/// `set_exam_course`: the exam moves to another Course.
export async function setExamCourse(db: LocalDb, id: string, courseId: string): Promise<void> {
  await write(db, relink(db, id, "exam-course", courseId));
}

// --- Assignments -----------------------------------------------------------

export interface AssignmentRecord {
  entity: EntityRecord;
  courseId: string | null;
  dueDate: string | null;
  /// Due this many days before a session of its Course, set on the desktop.
  dueSessionOffsetDays: number | null;
  weight: number | null;
  grade: number | null;
  status: string;
}

const ASSIGNMENT_SELECT = `SELECT ${ENTITY_COLUMNS}, a.due_date, a.due_session_offset_days, a.weight, a.grade, a.status,
  ${linkedTo("assignment-course")} AS course_id FROM entities e JOIN assignments a ON a.entity_id = e.id`;

function toAssignment(r: Row): AssignmentRecord {
  return {
    entity: toEntity(r),
    courseId: optStr(r.course_id),
    dueDate: optStr(r.due_date),
    dueSessionOffsetDays: optNum(r.due_session_offset_days),
    weight: optNum(r.weight),
    grade: optNum(r.grade),
    status: str(r.status),
  };
}

export async function listAssignments(
  db: LocalDb,
  query: { spaceId?: string; courseId?: string } = {},
): Promise<AssignmentRecord[]> {
  const filter = spaceFilter(query.spaceId);
  const byCourse = query.courseId ? ` AND ${linkedTo("assignment-course")} = ?` : "";
  return (
    await rows(
      db,
      `${ASSIGNMENT_SELECT} WHERE ${live}${filter.where}${byCourse} ORDER BY a.due_date IS NULL, a.due_date`,
      ...filter.params,
      ...(query.courseId ? [query.courseId] : []),
    )
  ).map(toAssignment);
}

export async function getAssignment(db: LocalDb, id: string): Promise<AssignmentRecord | null> {
  const row = await first(db, `${ASSIGNMENT_SELECT} WHERE e.id = ?`, id);
  return row ? toAssignment(row) : null;
}

/// `create_assignment`: not started, in its Course.
export async function createAssignment(
  db: LocalDb,
  spaceId: string,
  title: string,
  courseId: string,
  dueDate: string | null = null,
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "assignment", title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO assignments (entity_id, due_date, status, grade) VALUES (?, ?, 'not_started', NULL)",
      params: [id, dueDate],
    },
    ...relink(db, id, "assignment-course", courseId),
  ]);
  return id;
}

export interface AssignmentPatch {
  weight?: number | null;
  grade?: number | null;
  status?: string;
}

export async function updateAssignment(
  db: LocalDb,
  id: string,
  patch: AssignmentPatch,
): Promise<void> {
  await update(db, "assignments", id, {
    weight: patch.weight,
    grade: patch.grade,
    status: patch.status,
  });
}

/// `update_assignment_due_date`: a fixed day, which stops following a session.
export async function setAssignmentDueDate(
  db: LocalDb,
  id: string,
  dueDate: string | null,
): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE assignments SET due_date = ?, due_session_offset_days = NULL WHERE entity_id = ?",
      params: [dueDate, id],
    },
    ...relink(db, id, "assignment-due-session", null),
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

export async function setAssignmentCourse(
  db: LocalDb,
  id: string,
  courseId: string,
): Promise<void> {
  await write(db, relink(db, id, "assignment-course", courseId));
}

// --- Decks and Index Cards -------------------------------------------------

/// Learning cards due this soon still show when nothing else is due (the desktop's
/// `LEARN_AHEAD_MINUTES`).
const LEARN_AHEAD_MS = 20 * 60_000;

export interface IndexCard extends Schedule {
  id: string;
  deckId: string;
  front: string;
  back: string;
}

export interface DeckStats {
  total: number;
  new: number;
  learning: number;
  /// Review cards due now.
  due: number;
}

export interface DeckRecord {
  entity: EntityRecord;
  examId: string | null;
  stats: DeckStats;
}

const CARD_STATES: CardState[] = ["new", "learning", "review", "relearning"];
const cardState = (value: SqlValue | undefined): CardState =>
  CARD_STATES.find((s) => s === value) ?? "new";

function toCard(r: Row): IndexCard {
  return {
    id: str(r.id),
    deckId: str(r.deck_entity_id),
    front: str(r.front),
    back: str(r.back),
    state: cardState(r.state),
    dueAt: str(r.due_at),
    stability: num(r.stability),
    difficulty: num(r.difficulty),
    elapsedDays: num(r.elapsed_days),
    scheduledDays: num(r.scheduled_days),
    reps: num(r.reps),
    lapses: num(r.lapses),
    lastReviewAt: optStr(r.last_review_at),
  };
}

export async function listCards(db: LocalDb, deckId: string): Promise<IndexCard[]> {
  return (
    await rows(
      db,
      "SELECT * FROM index_cards WHERE deck_entity_id = ? AND deleted_at IS NULL ORDER BY created_at",
      deckId,
    )
  ).map(toCard);
}

const isDue = (card: IndexCard, now: number) => Date.parse(card.dueAt) <= now;
const learning = (card: IndexCard) => card.state === "learning" || card.state === "relearning";

export function deckStats(cards: IndexCard[], now = Date.now()): DeckStats {
  return {
    total: cards.length,
    new: cards.filter((c) => c.state === "new").length,
    learning: cards.filter((c) => learning(c) && isDue(c, now)).length,
    due: cards.filter((c) => c.state === "review" && isDue(c, now)).length,
  };
}

/// What to study now, like the desktop's `study_queue`: cards in (re)learning, reviews,
/// then new cards, each by due time. With nothing due, learning cards coming back soon.
export function studyQueue(cards: IndexCard[], now = Date.now()): IndexCard[] {
  const rank = (c: IndexCard) => (learning(c) ? 0 : c.state === "review" ? 1 : 2);
  const sorted = [...cards].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.dueAt) - Date.parse(b.dueAt),
  );
  const due = sorted.filter((c) => isDue(c, now));
  if (due.length > 0) return due;
  return sorted.filter((c) => learning(c) && Date.parse(c.dueAt) <= now + LEARN_AHEAD_MS);
}

export async function listDecks(db: LocalDb, spaceId?: string): Promise<DeckRecord[]> {
  const filter = spaceFilter(spaceId);
  const decks = await rows(
    db,
    `SELECT ${ENTITY_COLUMNS}, ${linkedTo("deck-exam")} AS exam_id FROM entities e
     JOIN index_card_decks d ON d.entity_id = e.id WHERE ${live}${filter.where} ORDER BY e.created_at`,
    ...filter.params,
  );
  return Promise.all(
    decks.map(async (r) => ({
      entity: toEntity(r),
      examId: optStr(r.exam_id),
      stats: deckStats(await listCards(db, str(r.id))),
    })),
  );
}

export async function getDeck(db: LocalDb, id: string): Promise<DeckRecord | null> {
  const row = await first(
    db,
    `SELECT ${ENTITY_COLUMNS}, ${linkedTo("deck-exam")} AS exam_id FROM entities e
     JOIN index_card_decks d ON d.entity_id = e.id WHERE e.id = ?`,
    id,
  );
  if (!row) return null;
  return {
    entity: toEntity(row),
    examId: optStr(row.exam_id),
    stats: deckStats(await listCards(db, id)),
  };
}

/// `create_deck`, filed under an Exam or none.
export async function createDeck(
  db: LocalDb,
  spaceId: string,
  title: string,
  examId: string | null = null,
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "index_card_deck", title);
  await write(db, [
    ...statements,
    { sql: "INSERT INTO index_card_decks (entity_id) VALUES (?)", params: [id] },
    ...(examId ? relink(db, id, "deck-exam", examId) : []),
  ]);
  return id;
}

export async function setDeckExam(db: LocalDb, id: string, examId: string | null): Promise<void> {
  await write(db, relink(db, id, "deck-exam", examId));
}

export async function createCard(
  db: LocalDb,
  deckId: string,
  front: string,
  back: string,
): Promise<string> {
  const id = db.newId();
  const now = iso(db);
  await write(db, [
    {
      sql: "INSERT INTO index_cards (id, deck_entity_id, front, back, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      params: [id, deckId, front, back, now, now, now],
    },
  ]);
  return id;
}

export async function updateCard(
  db: LocalDb,
  id: string,
  front: string,
  back: string,
): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE index_cards SET front = ?, back = ?, updated_at = ? WHERE id = ?",
      params: [front, back, iso(db), id],
    },
  ]);
}

/// `delete_card`: marked deleted, never removed.
export async function deleteCard(db: LocalDb, id: string): Promise<void> {
  await write(db, [
    { sql: "UPDATE index_cards SET deleted_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// The card's schedule as the desktop stores it with a review, so undo works there.
function snapshot(card: Schedule): string {
  return JSON.stringify({
    state: card.state,
    due_at: card.dueAt,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    last_review_at: card.lastReviewAt,
  });
}

/// `review_card`: schedules the card with FSRS for `rating` and logs the review.
export async function reviewCard(db: LocalDb, id: string, rating: Rating): Promise<void> {
  const row = await first(db, "SELECT * FROM index_cards WHERE id = ?", id);
  if (!row) throw new Error("This card is gone.");
  const previous = toCard(row);
  const now = db.now();
  const { card: next, log } = review(previous, rating, now);
  await write(db, [
    {
      sql: `UPDATE index_cards SET state = ?, due_at = ?, stability = ?, difficulty = ?, elapsed_days = ?,
            scheduled_days = ?, reps = ?, lapses = ?, last_review_at = ?, updated_at = ? WHERE id = ?`,
      params: [
        next.state,
        next.dueAt,
        next.stability,
        next.difficulty,
        next.elapsedDays,
        next.scheduledDays,
        next.reps,
        next.lapses,
        next.lastReviewAt,
        iso(db),
        id,
      ],
    },
    {
      sql: "INSERT INTO index_card_reviews (id, card_id, rating, state, elapsed_days, scheduled_days, previous, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        db.newId(),
        id,
        rating,
        log.state,
        log.elapsedDays,
        log.scheduledDays,
        snapshot(previous),
        now.toISOString(),
      ],
    },
  ]);
}

const snapshotSchema = z.object({
  state: z.string(),
  due_at: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  reps: z.number(),
  lapses: z.number(),
  last_review_at: z.string().nullable(),
});

/// `undo_review`: the card back the way it was before its latest review, and that review
/// dropped from the log.
export async function undoReview(db: LocalDb, id: string): Promise<void> {
  const latest = await first(
    db,
    "SELECT id, previous FROM index_card_reviews WHERE card_id = ? ORDER BY reviewed_at DESC LIMIT 1",
    id,
  );
  if (!latest) throw new Error("This card has no review to undo.");
  let previous: z.infer<typeof snapshotSchema>;
  try {
    previous = snapshotSchema.parse(JSON.parse(str(latest.previous)));
  } catch {
    throw new Error("This review can't be undone: its saved state is unreadable.");
  }
  await write(db, [
    {
      sql: `UPDATE index_cards SET state = ?, due_at = ?, stability = ?, difficulty = ?, elapsed_days = ?,
            scheduled_days = ?, reps = ?, lapses = ?, last_review_at = ?, updated_at = ? WHERE id = ?`,
      params: [
        previous.state,
        previous.due_at,
        previous.stability,
        previous.difficulty,
        previous.elapsed_days,
        previous.scheduled_days,
        previous.reps,
        previous.lapses,
        previous.last_review_at,
        iso(db),
        id,
      ],
    },
    { sql: "DELETE FROM index_card_reviews WHERE id = ?", params: [str(latest.id)] },
  ]);
}

/// When the card comes back for each rating.
export function nextDue(card: IndexCard, now = new Date()): NextDue {
  return preview(card, now);
}
