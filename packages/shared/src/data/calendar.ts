import { type LocalDb, iso, num, optStr, rows, str, write } from "./db.ts";
import { createEntityStatements } from "./entities.ts";

/// Something on the calendar: a Session (of a Course) or a Calendar entry.
export interface AgendaItem {
  id: string;
  kind: "session" | "calendar_entry";
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

/// Every Space's Sessions and Calendar entries from `from` to `to` (inclusive, ISO
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
     ORDER BY date, all_day DESC, start_time`,
    from,
    to,
    to,
    from,
  );
  return found.map((r) => ({
    id: str(r.id),
    kind: str(r.kind) === "session" ? "session" : "calendar_entry",
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

export interface CalendarEntryInput {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

/// A one off Calendar entry.
export async function createCalendarEntry(
  db: LocalDb,
  spaceId: string,
  input: CalendarEntryInput,
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "calendar_entry", input.title);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO calendar_entries (entity_id, date, start_time, end_time, all_day, location) VALUES (?, ?, ?, ?, ?, ?)",
      params: [
        id,
        input.date,
        input.allDay ? null : input.startTime,
        input.allDay ? null : input.endTime,
        input.allDay ? 1 : 0,
        input.location,
      ],
    },
  ]);
  return id;
}

export async function updateCalendarEntry(
  db: LocalDb,
  id: string,
  input: CalendarEntryInput,
): Promise<void> {
  const now = iso(db);
  await write(db, [
    {
      sql: "UPDATE entities SET title = ?, updated_at = ? WHERE id = ?",
      params: [input.title, now, id],
    },
    {
      sql: "UPDATE calendar_entries SET date = ?, start_time = ?, end_time = ?, all_day = ?, location = ? WHERE entity_id = ?",
      params: [
        input.date,
        input.allDay ? null : input.startTime,
        input.allDay ? null : input.endTime,
        input.allDay ? 1 : 0,
        input.location,
        id,
      ],
    },
  ]);
}
