import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";
import { createPage } from "./notes.ts";
import { FIELD, markOverride, validateDate, validateTimes } from "./series.ts";

/// Sessions of a course and study blocks for an exam, as the desktop keeps them
/// (`db/sessions.rs`, `db/study_blocks.rs`). Whole series are made and edited on the
/// desktop; the rows they produce sync here, and one occurrence can be changed alone.

export interface SessionRecord {
  entity: EntityRecord;
  templateId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  location: string | null;
  notes: string | null;
  courseId: string | null;
  courseTitle: string | null;
}

const SESSION_SELECT = `SELECT ${ENTITY_COLUMNS}, s.template_id, s.date, s.start_time, s.end_time, s.cancelled, s.location, s.notes,
  c.id AS course_id, c.title AS course_title
  FROM entities e JOIN sessions s ON s.entity_id = e.id
  LEFT JOIN relationships r ON r.from_entity_id = e.id AND r.relationship_type = 'session-course'
  LEFT JOIN entities c ON c.id = r.to_entity_id`;

function toSession(r: Record<string, string | number | null>): SessionRecord {
  return {
    entity: toEntity(r),
    templateId: optStr(r.template_id),
    date: str(r.date),
    startTime: str(r.start_time),
    endTime: str(r.end_time),
    cancelled: num(r.cancelled) !== 0,
    location: optStr(r.location),
    notes: optStr(r.notes),
    courseId: optStr(r.course_id),
    courseTitle: optStr(r.course_title),
  };
}

export interface SessionQuery {
  spaceId?: string;
  courseId?: string;
  from?: string;
  to?: string;
}

/// Sessions by day and time, cancelled ones too (they show struck through).
export async function listSessions(
  db: LocalDb,
  query: SessionQuery = {},
): Promise<SessionRecord[]> {
  const where = ["e.deleted_at IS NULL", "e.hidden_at IS NULL"];
  const params: string[] = [];
  if (query.spaceId) {
    where.push("e.space_id = ?");
    params.push(query.spaceId);
  }
  if (query.courseId) {
    where.push("r.to_entity_id = ?");
    params.push(query.courseId);
  }
  if (query.from) {
    where.push("s.date >= ?");
    params.push(query.from);
  }
  if (query.to) {
    where.push("s.date <= ?");
    params.push(query.to);
  }
  return (
    await rows(
      db,
      `${SESSION_SELECT} WHERE ${where.join(" AND ")} ORDER BY s.date, s.start_time`,
      ...params,
    )
  ).map(toSession);
}

export async function getSession(db: LocalDb, id: string): Promise<SessionRecord | null> {
  const row = await first(db, `${SESSION_SELECT} WHERE e.id = ?`, id);
  return row ? toSession(row) : null;
}

/// `create_one_off_session`: a session of a course that is not part of a series.
export async function createOneOffSession(
  db: LocalDb,
  spaceId: string,
  input: {
    title: string;
    courseId: string;
    date: string;
    startTime: string;
    endTime: string;
    location?: string | null;
  },
): Promise<string> {
  validateDate("The date", input.date);
  validateTimes("A session", false, input.startTime, input.endTime);
  if (!(await first(db, "SELECT 1 AS yes FROM courses WHERE entity_id = ?", input.courseId))) {
    throw new Error("Pick a course for the session.");
  }
  const { id, statements } = createEntityStatements(db, spaceId, "session", input.title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO sessions (entity_id, template_id, date, start_time, end_time, cancelled, location, notes) VALUES (?, NULL, ?, ?, ?, 0, ?, NULL)",
      params: [id, input.date, input.startTime, input.endTime, input.location ?? null],
    },
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'session-course', ?)",
      params: [db.newId(), id, input.courseId, iso(db)],
    },
  ]);
  return id;
}

export interface SessionPatch {
  date?: string;
  startTime?: string;
  endTime?: string;
  cancelled?: boolean;
  location?: string | null;
  notes?: string | null;
}

/// `override_occurrence`: changes this session alone. In a series, a field that now
/// differs from the series is marked, so a later edit of the series leaves it be.
export async function overrideSession(db: LocalDb, id: string, patch: SessionPatch): Promise<void> {
  const current = await first(
    db,
    "SELECT template_id, date, start_time, end_time, cancelled, location, notes, overridden_fields FROM sessions WHERE entity_id = ?",
    id,
  );
  if (!current) throw new Error("This session isn't here anymore.");
  const templateId = optStr(current.template_id);
  const series = templateId
    ? await first(
        db,
        "SELECT start_time, end_time, location FROM session_templates WHERE entity_id = ?",
        templateId,
      )
    : undefined;
  if (patch.date !== undefined) validateDate("The date", patch.date);
  const next = {
    date: patch.date ?? str(current.date),
    startTime: patch.startTime ?? str(current.start_time),
    endTime: patch.endTime ?? str(current.end_time),
    cancelled: patch.cancelled ?? num(current.cancelled) !== 0,
    location: patch.location === undefined ? optStr(current.location) : patch.location,
    notes: patch.notes === undefined ? optStr(current.notes) : patch.notes,
  };
  let mask = num(current.overridden_fields);
  if (patch.startTime !== undefined) {
    mask = markOverride(
      mask,
      FIELD.startTime,
      str(current.start_time),
      next.startTime,
      series ? str(series.start_time) : undefined,
    );
  }
  if (patch.endTime !== undefined) {
    mask = markOverride(
      mask,
      FIELD.endTime,
      str(current.end_time),
      next.endTime,
      series ? str(series.end_time) : undefined,
    );
  }
  if (patch.location !== undefined) {
    mask = markOverride(
      mask,
      FIELD.location,
      optStr(current.location),
      next.location,
      series ? optStr(series.location) : undefined,
    );
  }
  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    validateTimes("A session", false, next.startTime, next.endTime);
  }
  await write(db, [
    {
      sql: "UPDATE sessions SET date = ?, start_time = ?, end_time = ?, cancelled = ?, location = ?, notes = ?, overridden_fields = ? WHERE entity_id = ?",
      params: [
        next.date,
        next.startTime,
        next.endTime,
        next.cancelled ? 1 : 0,
        next.location,
        next.notes,
        mask,
        id,
      ],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

export interface StudyBlockRecord {
  entity: EntityRecord;
  date: string;
  startTime: string;
  endTime: string;
  examId: string | null;
}

const BLOCK_SELECT = `SELECT ${ENTITY_COLUMNS}, b.date, b.start_time, b.end_time, r.to_entity_id AS exam_id
  FROM entities e JOIN study_blocks b ON b.entity_id = e.id
  LEFT JOIN relationships r ON r.from_entity_id = e.id AND r.relationship_type = 'study-block-exam'`;

const toBlock = (r: Record<string, string | number | null>): StudyBlockRecord => ({
  entity: toEntity(r),
  date: str(r.date),
  startTime: str(r.start_time),
  endTime: str(r.end_time),
  examId: optStr(r.exam_id),
});

export async function listStudyBlocks(
  db: LocalDb,
  query: { spaceId?: string; examId?: string } = {},
): Promise<StudyBlockRecord[]> {
  const where = ["e.deleted_at IS NULL", "e.hidden_at IS NULL"];
  const params: string[] = [];
  if (query.spaceId) {
    where.push("e.space_id = ?");
    params.push(query.spaceId);
  }
  if (query.examId) {
    where.push("r.to_entity_id = ?");
    params.push(query.examId);
  }
  return (
    await rows(
      db,
      `${BLOCK_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.date, b.start_time`,
      ...params,
    )
  ).map(toBlock);
}

export async function getStudyBlock(db: LocalDb, id: string): Promise<StudyBlockRecord | null> {
  const row = await first(db, `${BLOCK_SELECT} WHERE e.id = ?`, id);
  return row ? toBlock(row) : null;
}

/// `create_study_block`: time set aside to prepare for an exam.
export async function createStudyBlock(
  db: LocalDb,
  spaceId: string,
  input: { title: string; examId: string; date: string; startTime: string; endTime: string },
): Promise<string> {
  validateDate("The date", input.date);
  validateTimes("A study block", false, input.startTime, input.endTime);
  if (!(await first(db, "SELECT 1 AS yes FROM exams WHERE entity_id = ?", input.examId))) {
    throw new Error("Pick an exam for the study block.");
  }
  const { id, statements } = createEntityStatements(db, spaceId, "study_block", input.title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO study_blocks (entity_id, date, start_time, end_time) VALUES (?, ?, ?, ?)",
      params: [id, input.date, input.startTime, input.endTime],
    },
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'study-block-exam', ?)",
      params: [db.newId(), id, input.examId, iso(db)],
    },
  ]);
  return id;
}

export async function updateStudyBlock(
  db: LocalDb,
  id: string,
  patch: { date?: string; startTime?: string; endTime?: string },
): Promise<void> {
  const current = await getStudyBlock(db, id);
  if (!current) throw new Error("This study block isn't here anymore.");
  const next = {
    date: patch.date ?? current.date,
    startTime: patch.startTime ?? current.startTime,
    endTime: patch.endTime ?? current.endTime,
  };
  validateDate("The date", next.date);
  validateTimes("A study block", false, next.startTime, next.endTime);
  await write(db, [
    {
      sql: "UPDATE study_blocks SET date = ?, start_time = ?, end_time = ? WHERE entity_id = ?",
      params: [next.date, next.startTime, next.endTime, id],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// The Jot or Note written for one session, if there is a live one.
export async function sessionPage(
  db: LocalDb,
  sessionId: string,
  kind: "jot" | "note",
): Promise<EntityRecord | null> {
  const row = await first(
    db,
    `SELECT ${ENTITY_COLUMNS} FROM relationships r JOIN entities e ON e.id = r.to_entity_id
     WHERE r.from_entity_id = ? AND r.relationship_type = ? AND e.deleted_at IS NULL
     ORDER BY r.created_at DESC LIMIT 1`,
    sessionId,
    `session-${kind}`,
  );
  return row ? toEntity(row) : null;
}

/// A new Jot or Note for a session, linked to it (`session-jot`, `session-note`), titled
/// after the session's course. A session has one of each, so an existing one is returned.
export async function createSessionPage(
  db: LocalDb,
  sessionId: string,
  kind: "jot" | "note",
): Promise<string> {
  const existing = await sessionPage(db, sessionId, kind);
  if (existing) return existing.id;
  const session = await getSession(db, sessionId);
  if (!session) throw new Error("This session isn't here anymore.");
  const name = session.courseTitle || session.entity.title || "Session";
  const page = await createPage(
    db,
    session.entity.spaceId,
    kind,
    `${name}, ${session.date}`,
  );
  await write(db, [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [db.newId(), sessionId, page, `session-${kind}`, iso(db)],
    },
  ]);
  return page;
}
