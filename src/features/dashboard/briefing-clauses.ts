import { differenceInCalendarDays, format } from "date-fns";
import type { BriefingSession, Task } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { formatClock, formatShortDate } from "@/lib/datetime";
import { parseDay, toDay } from "@/features/tasks/task-model";
import type { Deadline } from "./dashboard-data";
import { entityLink, type LinkTarget, listLink } from "./dashboard-links";

/// A run of the sentence. Every data backed run links somewhere: a `token` (a
/// count, time or day) renders as bold clickable text, a `name` (an entity title)
/// as a bounded pill.
export type Run =
  | { kind: "text"; text: string }
  | { kind: "token"; text: string; target: LinkTarget }
  | { kind: "name"; text: string; target: LinkTarget };

function text(value: string): Run {
  return { kind: "text", text: value };
}

function token(value: string, target: LinkTarget): Run {
  return { kind: "token", text: value, target };
}

function name(value: string, target: LinkTarget): Run {
  return { kind: "name", text: value, target };
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
  const list = listLink(
    "sessions",
    sessions.map((s) => s.spaceId),
  );
  if (sessions.length === 0) {
    const tail = pick(seed, SALT.sessions, [
      " today",
      " on the calendar",
      " scheduled",
      " on the books",
    ] as const);
    return { key: "sessions", icon: "📅", runs: [token("0 sessions", list), text(tail)] };
  }
  const earliest = sessions[0];
  const count = token(plural(sessions.length, "session"), list);
  const course = name(
    earliest.courseTitle || earliest.title || "Untitled Session",
    earliest.courseId
      ? entityLink(earliest.courseId, earliest.spaceId)
      : entityLink(earliest.entityId, earliest.spaceId),
  );
  const time = token(
    formatClock(earliest.startTime),
    entityLink(earliest.entityId, earliest.spaceId),
  );
  const templates: readonly Run[][] = [
    [count, text(" today, starting with "), course, text(" at "), time],
    [text("you've got "), count, text(" today, first up "), course, text(" at "), time],
    [count, text(" lined up today, kicking off with "), course, text(" at "), time],
    [text("first on deck: "), course, text(" at "), time, text(", one of "), count, text(" today")],
  ];
  return { key: "sessions", icon: "📅", runs: pick(seed, SALT.sessions, templates) };
}

function tasksClause(tasks: Task[], seed: number): Clause {
  const count = token(
    plural(tasks.length, "task"),
    listLink(
      "tasks",
      tasks.map((t) => t.entity.spaceId),
    ),
  );
  const templates: readonly Run[][] = [
    [count, text(" due")],
    [count, text(" on your plate")],
    [count, text(" waiting on you")],
    [count, text(" that need doing")],
  ];
  return { key: "tasks", icon: "✅", runs: pick(seed, SALT.tasks, templates) };
}

/// Deadlines due today, or failing that, within the next two days.
function collectUrgent(deadlines: Deadline[], today: string): Deadline[] {
  const dueToday = deadlines.filter((d) => d.date === today);
  if (dueToday.length > 0) return dueToday;
  return deadlines.filter((d) => differenceInCalendarDays(parseDay(d.date), parseDay(today)) <= 2);
}

function urgentClause(
  key: string,
  icon: string,
  noun: string,
  module: "exams" | "assignments",
  items: Deadline[],
  today: string,
  seed: number,
  salt: number,
): Clause {
  if (items.length === 0) {
    const zero = token(`0 ${noun}s`, listLink(module));
    const templates: readonly Run[][] = [
      [zero, text(" urgent")],
      [zero, text(" on the horizon")],
      [zero, text(" pressing")],
    ];
    return { key, icon, runs: pick(seed, salt, templates) };
  }
  if (items.length === 1) {
    const item = items[0];
    const target = entityLink(item.entity.id, item.entity.spaceId);
    const dayLabel = item.date === today ? "today" : formatShortDate(item.date);
    const title = name(displayTitle(item.entity), target);
    const day = token(dayLabel, target);
    const templates: readonly Run[][] = [
      [title, text(` ${noun} due `), day],
      [text(`your ${noun} `), title, text(" is due "), day],
      [title, text(" is coming up "), day],
    ];
    return { key, icon, runs: pick(seed, salt, templates) };
  }
  const count = token(
    `${items.length} ${noun}s`,
    listLink(
      module,
      items.map((d) => d.entity.spaceId),
    ),
  );
  const templates: readonly Run[][] = [
    [count, text(" coming up")],
    [count, text(" on the way")],
    [count, text(" to keep an eye on")],
  ];
  return { key, icon, runs: pick(seed, salt, templates) };
}

function jotsClause(jotCount: number, jotSpaceIds: string[], seed: number): Clause {
  const count = token(plural(jotCount, "jot"), listLink("jots", jotSpaceIds));
  const templates: readonly Run[][] = [
    [count, text(" waiting to be refined")],
    [count, text(" still raw, waiting for a second pass")],
    [count, text(" sitting in the queue")],
    [count, text(" that could use some polish")],
  ];
  return { key: "jots", icon: "📝", runs: pick(seed, SALT.jots, templates) };
}

export interface BriefingInputs {
  /// Today's Sessions, earliest first.
  sessions: BriefingSession[];
  /// Open Tasks due today or overdue.
  tasks: Task[];
  /// Upcoming Exams and Assignments, soonest first.
  deadlines: Deadline[];
  jotCount: number;
  /// Spaces holding the unrefined Jots, to pick which list the count opens.
  jotSpaceIds: string[];
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
  tasks,
  deadlines,
  jotCount,
  jotSpaceIds,
  now = new Date(),
}: BriefingInputs): Briefing {
  const seed = daySeed(now);
  const today = toDay(now);
  const exams = collectUrgent(
    deadlines.filter((d) => d.kind === "exam"),
    today,
  );
  const assignments = collectUrgent(
    deadlines.filter((d) => d.kind === "assignment"),
    today,
  );
  const clauses = [
    sessionsClause(sessions, seed),
    tasksClause(tasks, seed),
    urgentClause("exams", "📚", "exam", "exams", exams, today, seed, SALT.exams),
    urgentClause(
      "assignments",
      "📄",
      "assignment",
      "assignments",
      assignments,
      today,
      seed,
      SALT.assignments,
    ),
    jotsClause(jotCount, jotSpaceIds, seed),
  ];
  const connectors = SALT.connector.map((salt, i) => pick(seed, salt, CONNECTOR_VARIANTS[i]));

  return { greeting: greeting(now), clauses, connectors };
}
