import { differenceInCalendarDays, format, isSameDay, startOfDay } from "date-fns";
import type { Assignment, BriefingSession, Exam } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

export type Run = { kind: "text"; text: string } | { kind: "bold"; text: string };

function text(value: string): Run {
  return { kind: "text", text: value };
}

function bold(value: string): Run {
  return { kind: "bold", text: value };
}

export interface Clause {
  key: string;
  icon: string;
  runs: Run[];
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/// Stable per calendar day, so the sentence's phrasing varies day to day but
/// never mid-day/on re-render — still deterministic template assembly, no
/// randomness at request time.
function daySeed(now: Date): number {
  return Number(format(now, "yyyyMMdd"));
}

/// Picks a variant deterministically from `seed` + a per-slot `salt`, so
/// different clauses/connectors don't all flip in lockstep on the same day.
function pick<T>(seed: number, salt: number, options: readonly T[]): T {
  const n = seed + salt;
  const index = ((n % options.length) + options.length) % options.length;
  return options[index];
}

/// Bare `HH:mm` time string -> "10am" / "2:30pm". Not a date, so no date-fns parse.
function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr ?? "0");
  const period = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${hour12}${period}`
    : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const SALT = {
  sessions: 1,
  tasks: 2,
  exams: 3,
  assignments: 4,
  jots: 5,
  connector: [20, 21, 22, 23] as const,
};

function sessionsClause(sessions: BriefingSession[], seed: number): Clause {
  if (sessions.length === 0) {
    const tail = pick(seed, SALT.sessions, [
      " today",
      " on the calendar",
      " scheduled",
      " on the books",
    ] as const);
    return { key: "sessions", icon: "📅", runs: [bold("0 sessions"), text(tail)] };
  }
  const earliest = sessions[0];
  const count = bold(plural(sessions.length, "session"));
  const course = bold(earliest.courseTitle || earliest.title || "Untitled Session");
  const time = bold(formatTime(earliest.startTime));
  const templates: readonly Run[][] = [
    [count, text(" today, starting with "), course, text(" at "), time],
    [text("you've got "), count, text(" today, first up "), course, text(" at "), time],
    [count, text(" lined up today, kicking off with "), course, text(" at "), time],
    [text("first on deck: "), course, text(" at "), time, text(", one of "), count, text(" today")],
  ];
  return { key: "sessions", icon: "📅", runs: pick(seed, SALT.sessions, templates) };
}

function tasksClause(openTaskCount: number, seed: number): Clause {
  const count = bold(plural(openTaskCount, "task"));
  const templates: readonly Run[][] = [
    [count, text(" due")],
    [count, text(" on your plate")],
    [count, text(" waiting on you")],
    [count, text(" that need doing")],
  ];
  return { key: "tasks", icon: "✅", runs: pick(seed, SALT.tasks, templates) };
}

interface UrgentItem {
  title: string;
  date: string;
}

function collectUrgent(items: UrgentItem[], today: Date): UrgentItem[] {
  const start = startOfDay(today);
  const candidates = items
    .filter((item) => startOfDay(new Date(item.date)) >= start)
    .sort((a, b) => a.date.localeCompare(b.date));

  const dueToday = candidates.filter((item) => isSameDay(new Date(item.date), today));
  if (dueToday.length > 0) return dueToday;
  return candidates.filter((item) => differenceInCalendarDays(new Date(item.date), today) <= 2);
}

function urgentClause(
  key: string,
  icon: string,
  noun: string,
  items: UrgentItem[],
  today: Date,
  seed: number,
  salt: number,
): Clause {
  if (items.length === 0) {
    const templates: readonly Run[][] = [
      [bold(`0 ${noun}s`), text(" urgent")],
      [bold(`0 ${noun}s`), text(" on the horizon")],
      [bold(`0 ${noun}s`), text(" pressing")],
    ];
    return { key, icon, runs: pick(seed, salt, templates) };
  }
  if (items.length === 1) {
    const item = items[0];
    const dayLabel = isSameDay(new Date(item.date), today)
      ? "today"
      : format(new Date(item.date), "MMM d");
    const title = bold(item.title);
    const day = bold(dayLabel);
    const templates: readonly Run[][] = [
      [title, text(` ${noun} due `), day],
      [text(`your ${noun} `), title, text(" is due "), day],
      [title, text(" is coming up "), day],
    ];
    return { key, icon, runs: pick(seed, salt, templates) };
  }
  const count = bold(`${items.length} ${noun}s`);
  const templates: readonly Run[][] = [
    [count, text(" coming up")],
    [count, text(" on the way")],
    [count, text(" to keep an eye on")],
  ];
  return { key, icon, runs: pick(seed, salt, templates) };
}

function examsClause(exams: Exam[], today: Date, seed: number): Clause {
  const items = collectUrgent(
    exams
      .filter(
        (e): e is Exam & { examDate: string } =>
          e.entity.deletedAt == null && e.grade == null && e.examDate != null,
      )
      .map((e) => ({ title: displayTitle(e.entity), date: e.examDate })),
    today,
  );
  return urgentClause("exams", "📚", "exam", items, today, seed, SALT.exams);
}

function assignmentsClause(assignments: Assignment[], today: Date, seed: number): Clause {
  const items = collectUrgent(
    assignments
      .filter(
        (a): a is Assignment & { dueDate: string } =>
          a.entity.deletedAt == null && a.grade == null && a.dueDate != null,
      )
      .map((a) => ({ title: displayTitle(a.entity), date: a.dueDate })),
    today,
  );
  return urgentClause("assignments", "📄", "assignment", items, today, seed, SALT.assignments);
}

function jotsClause(jotCount: number, seed: number): Clause {
  const count = bold(plural(jotCount, "jot"));
  const templates: readonly Run[][] = [
    [count, text(" waiting to be refined")],
    [count, text(" still raw, waiting for a second pass")],
    [count, text(" sitting in the queue")],
    [count, text(" that could use some polish")],
  ];
  return { key: "jots", icon: "📝", runs: pick(seed, SALT.jots, templates) };
}

export interface BriefingInputs {
  sessions: BriefingSession[];
  openTaskCount: number;
  exams: Exam[];
  assignments: Assignment[];
  jotCount: number;
  now?: Date;
}

export interface Briefing {
  greeting: string;
  clauses: Clause[];
  /// Connective text between each pair of adjacent clauses — length `clauses.length - 1`.
  connectors: string[];
}

const CONNECTOR_VARIANTS = [
  [". ", ". Also, ", ". Plus, "],
  [", ", ", also ", ", plus "],
  [", and ", ", plus ", " and "],
  [". Oh, and ", ". Also, ", ". And don't forget, "],
] as const;

/// Every category always shows, even at zero — no clause is hidden or trimmed.
/// Phrasing (clauses and connectors) is picked per calendar day from a small
/// set of variants, so the banner doesn't read identically every day.
export function buildBriefing({
  sessions,
  openTaskCount,
  exams,
  assignments,
  jotCount,
  now = new Date(),
}: BriefingInputs): Briefing {
  const seed = daySeed(now);
  const clauses = [
    sessionsClause(sessions, seed),
    tasksClause(openTaskCount, seed),
    examsClause(exams, now, seed),
    assignmentsClause(assignments, now, seed),
    jotsClause(jotCount, seed),
  ];
  const connectors = SALT.connector.map((salt, i) => pick(seed, salt, CONNECTOR_VARIANTS[i]));

  return { greeting: greeting(now), clauses, connectors };
}
