import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import { createEntityStatements } from "./entities.ts";
import {
  FIELD,
  TITLE_OVERRIDE,
  markOverride,
  validateDate,
  validateDateRange,
  validateTimes,
} from "./series.ts";

/// Something on the calendar: a Session (of a Course), a Calendar entry, an Exam or a
/// Study block.
export interface AgendaItem {
  id: string;
  kind: "session" | "calendar_entry" | "exam" | "study_block";
  spaceId: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
}

/// Every Space's Sessions, Calendar entries, Exams and Study blocks from `from` to `to` (inclusive, ISO
/// days), cancelled ones left out, by day and time.
export async function agenda(db: LocalDb, from: string, to: string): Promise<AgendaItem[]> {
  const found = await rows(
    db,
    `SELECT e.id, 'session' AS kind, e.space_id, e.title, s.date, NULL AS end_date, s.start_time, s.end_time, 0 AS all_day, s.location, s.notes AS description
       FROM sessions s JOIN entities e ON e.id = s.entity_id
       WHERE s.cancelled = 0 AND e.deleted_at IS NULL AND e.hidden_at IS NULL AND s.date BETWEEN ? AND ?
     UNION ALL
     SELECT e.id, 'calendar_entry', e.space_id, e.title, c.date, c.end_date, c.start_time, c.end_time, c.all_day, c.location, c.description
       FROM calendar_entries c JOIN entities e ON e.id = c.entity_id
       WHERE c.cancelled = 0 AND e.deleted_at IS NULL AND e.hidden_at IS NULL AND c.date <= ? AND COALESCE(c.end_date, c.date) >= ?
     UNION ALL
     SELECT e.id, 'exam', e.space_id, e.title, x.exam_date, NULL, x.exam_time, NULL, x.exam_time IS NULL, x.room, NULL
       FROM exams x JOIN entities e ON e.id = x.entity_id
       WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL AND x.exam_date BETWEEN ? AND ?
     UNION ALL
     SELECT e.id, 'study_block', e.space_id, e.title, b.date, NULL, b.start_time, b.end_time, 0, NULL, NULL
       FROM study_blocks b JOIN entities e ON e.id = b.entity_id
       WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL AND b.date BETWEEN ? AND ?
     ORDER BY date, all_day DESC, start_time`,
    from,
    to,
    to,
    from,
    from,
    to,
    from,
    to,
  );
  return found.map((r) => ({
    id: str(r.id),
    kind: agendaKind(str(r.kind)),
    spaceId: str(r.space_id),
    title: str(r.title),
    date: str(r.date),
    endDate: optStr(r.end_date),
    startTime: optStr(r.start_time),
    endTime: optStr(r.end_time),
    allDay: num(r.all_day) !== 0,
    location: optStr(r.location),
    description: optStr(r.description),
  }));
}

function agendaKind(kind: string): AgendaItem["kind"] {
  return kind === "session" || kind === "exam" || kind === "study_block" ? kind : "calendar_entry";
}

export interface CalendarEntryInput {
  title: string;
  date: string;
  /// The last day of an entry that lasts more than one.
  endDate?: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  description?: string | null;
}

function checkEntry(input: CalendarEntryInput) {
  validateDate("The date", input.date);
  if (input.endDate) validateDate("The end date", input.endDate);
  validateTimes("A calendar entry", input.allDay, input.startTime, input.endTime);
  validateDateRange(input.date, input.endDate ?? null);
}

/// A one off Calendar entry.
export async function createCalendarEntry(
  db: LocalDb,
  spaceId: string,
  input: CalendarEntryInput,
): Promise<string> {
  checkEntry(input);
  const { id, statements } = createEntityStatements(db, spaceId, "calendar_entry", input.title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO calendar_entries (entity_id, date, end_date, start_time, end_time, all_day, location, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        id,
        input.date,
        input.endDate ?? null,
        input.allDay ? null : input.startTime,
        input.allDay ? null : input.endTime,
        input.allDay ? 1 : 0,
        input.location,
        input.description ?? null,
      ],
    },
  ]);
  return id;
}

/// `override_occurrence`, for any entry: a one off just changes. An occurrence of a
/// series changes alone, and the fields that now differ from its series are marked, so
/// a later edit of the series on any device leaves them be (never the other way round).
export async function updateCalendarEntry(
  db: LocalDb,
  id: string,
  input: CalendarEntryInput,
): Promise<void> {
  checkEntry(input);
  const current = await first(
    db,
    `SELECT e.title, c.template_id, c.start_time, c.end_time, c.all_day, c.location, c.description, c.overridden_fields
       FROM calendar_entries c JOIN entities e ON e.id = c.entity_id WHERE c.entity_id = ?`,
    id,
  );
  if (!current) throw new Error("This entry isn't here anymore.");
  const templateId = optStr(current.template_id);
  const series = templateId
    ? await first(
        db,
        "SELECT start_time, end_time, all_day, location, description FROM calendar_entry_templates WHERE entity_id = ?",
        templateId,
      )
    : undefined;
  const next = {
    startTime: input.allDay ? null : input.startTime,
    endTime: input.allDay ? null : input.endTime,
    allDay: input.allDay,
    location: input.location,
    description: input.description === undefined ? optStr(current.description) : input.description,
  };
  let mask = num(current.overridden_fields);
  mask = markOverride(
    mask,
    FIELD.startTime,
    optStr(current.start_time),
    next.startTime,
    series ? optStr(series.start_time) : undefined,
  );
  mask = markOverride(
    mask,
    FIELD.endTime,
    optStr(current.end_time),
    next.endTime,
    series ? optStr(series.end_time) : undefined,
  );
  mask = markOverride(
    mask,
    FIELD.allDay,
    num(current.all_day) !== 0,
    next.allDay,
    series ? num(series.all_day) !== 0 : undefined,
  );
  mask = markOverride(
    mask,
    FIELD.location,
    optStr(current.location),
    next.location,
    series ? optStr(series.location) : undefined,
  );
  mask = markOverride(
    mask,
    FIELD.description,
    optStr(current.description),
    next.description,
    series ? optStr(series.description) : undefined,
  );
  // A title changed on an occurrence is its own, as `update_entity` marks it.
  if (templateId && input.title !== str(current.title)) mask |= TITLE_OVERRIDE;
  await write(db, [
    {
      sql: "UPDATE entities SET title = ?, updated_at = ? WHERE id = ?",
      params: [input.title, iso(db), id],
    },
    {
      sql: "UPDATE calendar_entries SET date = ?, end_date = ?, start_time = ?, end_time = ?, all_day = ?, location = ?, description = ?, overridden_fields = ? WHERE entity_id = ?",
      params: [
        input.date,
        input.endDate ?? null,
        next.startTime,
        next.endTime,
        next.allDay ? 1 : 0,
        next.location,
        next.description,
        mask,
        id,
      ],
    },
  ]);
}

/// Cancels an occurrence of a series (or a one off), or brings it back. Nothing is removed.
export async function setCalendarEntryCancelled(
  db: LocalDb,
  id: string,
  cancelled: boolean,
): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE calendar_entries SET cancelled = ? WHERE entity_id = ?",
      params: [cancelled ? 1 : 0, id],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// One calendar entry as it is stored, cancelled or not.
export interface CalendarEntryRecord extends CalendarEntryInput {
  id: string;
  spaceId: string;
  cancelled: boolean;
  /// The series it is an occurrence of, if any.
  templateId: string | null;
}

export async function getCalendarEntry(
  db: LocalDb,
  id: string,
): Promise<CalendarEntryRecord | null> {
  const r = await first(
    db,
    `SELECT e.id, e.space_id, e.title, c.template_id, c.date, c.end_date, c.start_time, c.end_time, c.all_day, c.cancelled, c.location, c.description
       FROM calendar_entries c JOIN entities e ON e.id = c.entity_id WHERE e.id = ?`,
    id,
  );
  return r
    ? {
        id: str(r.id),
        spaceId: str(r.space_id),
        title: str(r.title),
        templateId: optStr(r.template_id),
        date: str(r.date),
        endDate: optStr(r.end_date),
        startTime: optStr(r.start_time),
        endTime: optStr(r.end_time),
        allDay: num(r.all_day) !== 0,
        cancelled: num(r.cancelled) !== 0,
        location: optStr(r.location),
        description: optStr(r.description),
      }
    : null;
}
