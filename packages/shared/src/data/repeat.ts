import { createCalendarEntry, type CalendarEntryInput } from "./calendar.ts";
import { type LocalDb, iso, write } from "./db.ts";
import type { SqlStatement } from "../sync/sql.ts";
import { createEntityStatements } from "./entities.ts";
import { createOneOffSession } from "./sessions.ts";
import { validateDate, validateTimes } from "./series.ts";

/// Repeating sessions and calendar entries, as the desktop makes them (its quick create
/// dialogs, `lib/repeat.ts`, and `db/sessions.rs` and `db/calendar.rs` for the series):
/// a weekly session or any repeating entry is a template with its occurrences, each slot
/// recorded so it is never filled twice; a daily or monthly session is single sessions.

export type Cadence = "none" | "daily" | "weekly" | "monthly";

export interface RepeatPlan {
  cadence: Cadence;
  /// For a while (`durationCount` `durationUnit`s) or until a day.
  endMode: "for" | "until";
  durationCount: number;
  durationUnit: "days" | "weeks" | "months" | "years";
  until: string;
}

export const MAX_OCCURRENCES = 366;

export const DEFAULT_REPEAT: RepeatPlan = {
  cadence: "none",
  endMode: "for",
  durationCount: 16,
  durationUnit: "weeks",
  until: "",
};

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
};
const format = (date: Date) => date.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const daysIn = (y: number, m: number) => utc(y, m + 1, 0).getUTCDate();

function addDays(day: string, n: number): string {
  const { y, m, d } = parse(day);
  return format(utc(y, m, d + n));
}

/// Months on, clamped to the last day of a shorter month, always counted from `day` itself
/// so a month end comes back (Jan 31, Feb 28, Mar 31), as chrono and date-fns do.
function addMonths(day: string, n: number): string {
  const { y, m, d } = parse(day);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return format(utc(year, month, Math.min(d, daysIn(year, month))));
}

/// The `n`th day of a cadence counted from `start` (0 is `start` itself).
function nthDay(start: string, n: number, cadence: Exclude<Cadence, "none">): string {
  if (cadence === "daily") return addDays(start, n);
  if (cadence === "weekly") return addDays(start, 7 * n);
  return addMonths(start, n);
}

/// Where a series stops, exclusive.
function seriesEnd(start: string, plan: RepeatPlan): string | null {
  if (plan.endMode === "until") {
    return /^\d{4}-\d{2}-\d{2}$/.test(plan.until) ? addDays(plan.until, 1) : null;
  }
  const n = plan.durationCount;
  if (plan.durationUnit === "days") return addDays(start, n);
  if (plan.durationUnit === "weeks") return addDays(start, 7 * n);
  if (plan.durationUnit === "months") return addMonths(start, n);
  return addMonths(start, 12 * n);
}

/// Every day an item lands on, from `start` up to the end of its while, or up to and
/// including its until day. A missing or earlier until day keeps only the start.
export function repeatDays(start: string, plan: RepeatPlan): string[] {
  if (plan.cadence === "none") return [start];
  const end = seriesEnd(start, plan);
  if (!end || (plan.endMode === "until" && end <= start)) return [start];
  const days: string[] = [];
  for (let i = 0; days.length <= MAX_OCCURRENCES; i++) {
    const next = nthDay(start, i, plan.cadence);
    if (next >= end) break;
    days.push(next);
  }
  return days;
}

/// Why a series can't be made as picked, or null when it can.
export function repeatProblem(start: string, plan: RepeatPlan): string | null {
  if (plan.cadence === "none" || plan.endMode === "for") return null;
  if (!plan.until) return "Pick a day to repeat until";
  return plan.until < start ? "Repeat until a day on or after the start" : null;
}

function plannedDays(start: string, plan: RepeatPlan, noun: string): string[] {
  const problem = repeatProblem(start, plan);
  if (problem) throw new Error(problem);
  const days = repeatDays(start, plan);
  if (days.length > MAX_OCCURRENCES) {
    throw new Error(`Too many ${noun}, ${MAX_OCCURRENCES} at most`);
  }
  return days;
}

const slot = (templateId: string, day: string): SqlStatement => ({
  sql: "INSERT OR IGNORE INTO series_slots (template_id, slot_date) VALUES (?, ?)",
  params: [templateId, day],
});

export interface SessionInput {
  title: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

/// A session that may repeat: weekly makes a series (its template, then a session a
/// week), daily or monthly single sessions. The ids of the sessions made, first first.
export async function createSessionSeries(
  db: LocalDb,
  spaceId: string,
  input: SessionInput,
  plan: RepeatPlan,
): Promise<string[]> {
  validateDate("The date", input.date);
  validateTimes("A session", false, input.startTime, input.endTime);
  const days = plannedDays(input.date, plan, "sessions");
  if (plan.cadence !== "weekly" || days.length < 2) {
    const ids: string[] = [];
    for (const date of days) ids.push(await createOneOffSession(db, spaceId, { ...input, date }));
    return ids;
  }
  const now = iso(db);
  const template = createEntityStatements(db, spaceId, "session_template", input.title);
  const { y, m, d } = parse(input.date);
  const weekday = (utc(y, m, d).getUTCDay() + 6) % 7;
  const link = (from: string): SqlStatement => ({
    sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'session-course', ?)",
    params: [db.newId(), from, input.courseId, now],
  });
  const statements: SqlStatement[] = [
    ...template.statements,
    {
      sql: "INSERT INTO session_templates (entity_id, weekday, start_time, end_time, location, anchor_date) VALUES (?, ?, ?, ?, ?, ?)",
      params: [template.id, weekday, input.startTime, input.endTime, input.location, input.date],
    },
    link(template.id),
  ];
  const ids: string[] = [];
  for (const date of days) {
    const occurrence = createEntityStatements(db, spaceId, "session", input.title);
    ids.push(occurrence.id);
    statements.push(
      ...occurrence.statements,
      {
        sql: "INSERT INTO sessions (entity_id, template_id, date, start_time, end_time, cancelled, location, notes) VALUES (?, ?, ?, ?, ?, 0, ?, NULL)",
        params: [occurrence.id, template.id, date, input.startTime, input.endTime, input.location],
      },
      link(occurrence.id),
      slot(template.id, date),
    );
  }
  await requireCourse(db, input.courseId);
  await write(db, statements);
  return ids;
}

async function requireCourse(db: LocalDb, courseId: string) {
  const found = await db.driver.query("SELECT 1 AS yes FROM courses WHERE entity_id = ?", [
    courseId,
  ]);
  if (found.length === 0) throw new Error("Pick a course for the session.");
}

/// A calendar entry that may repeat: a series (its template, then an entry each time)
/// when it does, one entry when it doesn't. One over several days never repeats. The ids
/// of the entries made, first first.
export async function createCalendarEntrySeries(
  db: LocalDb,
  spaceId: string,
  input: CalendarEntryInput,
  plan: RepeatPlan,
): Promise<string[]> {
  const cadence = input.endDate ? "none" : plan.cadence;
  const days = plannedDays(input.date, { ...plan, cadence }, "entries");
  if (cadence === "none" || days.length < 2) return [await createCalendarEntry(db, spaceId, input)];
  validateDate("The date", input.date);
  validateTimes("A calendar entry", input.allDay, input.startTime, input.endTime);
  const startTime = input.allDay ? null : input.startTime;
  const endTime = input.allDay ? null : input.endTime;
  const description = input.description ?? null;
  const template = createEntityStatements(db, spaceId, "calendar_entry_template", input.title);
  const statements: SqlStatement[] = [
    ...template.statements,
    {
      sql: "INSERT INTO calendar_entry_templates (entity_id, recurrence, start_time, end_time, all_day, location, description, anchor_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        template.id,
        cadence,
        startTime,
        endTime,
        input.allDay ? 1 : 0,
        input.location,
        description,
        input.date,
      ],
    },
  ];
  const ids: string[] = [];
  for (const date of days) {
    const occurrence = createEntityStatements(db, spaceId, "calendar_entry", input.title);
    ids.push(occurrence.id);
    statements.push(
      ...occurrence.statements,
      {
        sql: "INSERT INTO calendar_entries (entity_id, template_id, date, end_date, start_time, end_time, all_day, location, description) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)",
        params: [
          occurrence.id,
          template.id,
          date,
          startTime,
          endTime,
          input.allDay ? 1 : 0,
          input.location,
          description,
        ],
      },
      slot(template.id, date),
    );
  }
  await write(db, statements);
  return ids;
}
