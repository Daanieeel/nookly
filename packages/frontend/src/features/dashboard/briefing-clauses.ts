import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { BriefingSession, Task } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { formatClock, formatShortDate } from "#/lib/datetime.ts";
import { parseDay, toDay } from "#/features/tasks/task-model.ts";
import type { Deadline } from "./dashboard-data";
import { entityLink, type LinkTarget, listLink, overviewLink } from "./dashboard-links";

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

/// A deck with cards to study today.
export interface BriefingDeck {
  entityId: string;
  spaceId: string;
  title: string;
  cards: number;
}

export interface BriefingInputs {
  /// What to call the person; empty when they never said.
  name: string;
  /// Today's Sessions, earliest first, including those that already started.
  sessions: BriefingSession[];
  /// Open Tasks due today or overdue.
  tasks: Task[];
  /// Upcoming Exams and Assignments, soonest first.
  deadlines: Deadline[];
  /// Decks with cards to study today.
  decks: BriefingDeck[];
  jotCount: number;
  /// When the oldest unrefined Jot was made.
  oldestJotAt: string | null;
  /// Spaces holding the unrefined Jots, to pick which list the count opens.
  jotSpaceIds: string[];
  now?: Date;
}

export interface Briefing {
  /// "Good morning, Daniel", without the mark that ends it.
  greeting: string;
  /// An opening remark about what stands out most, or nothing.
  lead: Run[];
  /// Text between the lead and the first clause; empty without a lead.
  bridge: string;
  clauses: Clause[];
  /// Connective text between each pair of adjacent clauses, `clauses.length - 1` long.
  connectors: string[];
}

function greetingFor(now: Date, who: string): string {
  const hour = now.getHours();
  const part =
    hour < 5
      ? "Still up"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  return who ? `${part}, ${who}` : part;
}

/// Stable per calendar day, so the sentence's phrasing varies day to day but
/// never mid-day or on re-render.
function daySeed(now: Date): number {
  return Number(format(now, "yyyyMMdd"));
}

/// Picks a variant deterministically from `seed` + a per-slot `salt`, so
/// different clauses don't all flip in lockstep on the same day.
function pick<T>(seed: number, salt: number, options: readonly T[]): T {
  const n = seed + salt;
  const index = ((n % options.length) + options.length) % options.length;
  return options[index];
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/// The same runs with the first letter of a leading text run capitalized.
function capitalize(runs: Run[]): Run[] {
  const [first, ...rest] = runs;
  if (first?.kind !== "text") return runs;
  return [text(first.text.charAt(0).toUpperCase() + first.text.slice(1)), ...rest];
}

const SALT = {
  sessions: 1,
  tasks: 2,
  exams: 3,
  assignments: 4,
  jots: 5,
  decks: 6,
  connector: 20,
  rest: 30,
  lead: 40,
};

/// One part of the day that has nothing in it, said as a short link.
interface Quiet {
  key: string;
  run: Run;
}

type Part = { clause: Clause } | { quiet: Quiet };

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Sessions

function sessionsPart(upcoming: BriefingSession[], finished: number, seed: number): Part {
  const list = listLink(
    "sessions",
    upcoming.map((s) => s.spaceId),
  );
  if (upcoming.length === 0 && finished === 0) {
    return { quiet: { key: "sessions", run: token("sessions", listLink("sessions")) } };
  }
  if (upcoming.length === 0) {
    const done = pick(seed, SALT.sessions, [
      "all done for today",
      "finished for today",
      "wrapped up for today",
    ] as const);
    return {
      clause: {
        key: "sessions",
        icon: "🎉",
        runs: [
          text("your "),
          token(plural(finished, "session"), listLink("sessions")),
          text(` ${finished === 1 ? "is" : "are"} ${done}`),
        ],
      },
    };
  }
  const next = upcoming[0];
  const count = token(plural(upcoming.length, "session"), list);
  const course = name(
    next.courseTitle || next.title || "Untitled Session",
    next.courseId
      ? entityLink(next.courseId, next.spaceId)
      : entityLink(next.entityId, next.spaceId),
  );
  const time = token(formatClock(next.startTime), entityLink(next.entityId, next.spaceId));
  const more = finished > 0 ? " still ahead" : " today";
  const templates: readonly Run[][] = [
    [count, text(`${more}, starting with `), course, text(" at "), time],
    [text("you've got "), count, text(`${more}, first up `), course, text(" at "), time],
    [
      count,
      text(
        ` lined up${more === " today" ? " today" : " for the rest of the day"}, kicking off with `,
      ),
      course,
      text(" at "),
      time,
    ],
    [text("next up: "), course, text(" at "), time, text(", one of "), count, text(more)],
  ];
  return { clause: { key: "sessions", icon: "📅", runs: pick(seed, SALT.sessions, templates) } };
}

// Tasks

function tasksPart(tasks: Task[], today: string, seed: number): Part {
  const overdue = tasks.filter((t) => (t.dueDate ?? "9999").slice(0, 10) < today);
  const dueToday = tasks.filter((t) => !overdue.includes(t));
  const todayList = overviewLink("tasks", ["today"]);
  const overdueList = overviewLink("tasks", ["overdue"]);
  if (tasks.length === 0) {
    return { quiet: { key: "tasks", run: token("tasks", overviewLink("tasks")) } };
  }
  const one = (task: Task) =>
    name(displayTitle(task.entity), entityLink(task.entity.id, task.entity.spaceId));
  let runs: Run[];
  if (overdue.length === 0) {
    runs =
      dueToday.length === 1
        ? [
            one(dueToday[0]),
            text(
              pick(seed, SALT.tasks, [
                " is due today",
                " is on today's list",
                " needs doing today",
              ] as const),
            ),
          ]
        : [
            token(plural(dueToday.length, "task"), todayList),
            text(
              pick(seed, SALT.tasks, [
                " due today",
                " on your plate today",
                " waiting on you today",
              ] as const),
            ),
          ];
  } else if (dueToday.length === 0) {
    runs =
      overdue.length === 1
        ? [one(overdue[0]), text(" slipped past its date")]
        : [
            token(plural(overdue.length, "task"), overdueList),
            text(
              pick(seed, SALT.tasks, [
                " overdue to catch up on",
                " that slipped past their date",
              ] as const),
            ),
          ];
  } else {
    runs = [
      token(plural(dueToday.length, "task"), todayList),
      text(" due today and "),
      token(`${overdue.length} overdue`, overdueList),
    ];
  }
  return { clause: { key: "tasks", icon: overdue.length > 0 ? "⏰" : "✅", runs } };
}

// Exams and assignments

/// Deadlines due today, or failing that, within the next two days.
function collectUrgent(deadlines: Deadline[], today: string): Deadline[] {
  const dueToday = deadlines.filter((d) => d.date === today);
  if (dueToday.length > 0) return dueToday;
  return deadlines.filter((d) => differenceInCalendarDays(parseDay(d.date), parseDay(today)) <= 2);
}

function dayWord(date: string, today: string): string {
  const days = differenceInCalendarDays(parseDay(date), parseDay(today));
  return days === 0 ? "today" : days === 1 ? "tomorrow" : formatShortDate(date);
}

function urgentPart(
  key: "exams" | "assignments",
  icon: string,
  noun: string,
  quietText: string,
  items: Deadline[],
  today: string,
  seed: number,
): Part {
  if (items.length === 0) {
    const target = key === "assignments" ? overviewLink("assignments") : listLink(key);
    return { quiet: { key, run: token(quietText, target) } };
  }
  if (items.length === 1) {
    const item = items[0];
    const target = entityLink(item.entity.id, item.entity.spaceId);
    const title = name(displayTitle(item.entity), target);
    const day = token(dayWord(item.date, today), target);
    const templates: readonly Run[][] = [
      [title, text(` ${noun} due `), day],
      [text(`your ${noun} `), title, text(" is due "), day],
      [title, text(" is coming up "), day],
    ];
    return { clause: { key, icon, runs: pick(seed, SALT[key], templates) } };
  }
  const target =
    key === "assignments"
      ? overviewLink(
          "assignments",
          items.every((d) => d.date === today) ? ["today"] : ["week", "next"],
        )
      : listLink(
          key,
          items.map((d) => d.entity.spaceId),
        );
  const count = token(plural(items.length, noun), target);
  const templates: readonly Run[][] = [
    [count, text(" coming up")],
    [count, text(" on the way")],
    [count, text(" to keep an eye on")],
  ];
  return { clause: { key, icon, runs: pick(seed, SALT[key], templates) } };
}

// Decks

function decksPart(decks: BriefingDeck[], seed: number): Part {
  if (decks.length === 0) {
    return { quiet: { key: "decks", run: token("decks", listLink("decks")) } };
  }
  const total = decks.reduce((sum, d) => sum + d.cards, 0);
  const list = listLink(
    "decks",
    decks.map((d) => d.spaceId),
  );
  const cards = token(plural(total, "card"), list);
  if (decks.length === 1) {
    const deck = decks[0];
    const title = name(deck.title, entityLink(deck.entityId, deck.spaceId));
    const templates: readonly Run[][] = [
      [cards, text(" ready to study in "), title],
      [title, text(" has "), cards, text(" waiting for you")],
    ];
    return { clause: { key: "decks", icon: "🧠", runs: pick(seed, SALT.decks, templates) } };
  }
  return {
    clause: {
      key: "decks",
      icon: "🧠",
      runs: [cards, text(" ready to study across "), token(plural(decks.length, "deck"), list)],
    },
  };
}

// Jots

function jotsPart(
  count: number,
  oldestAt: string | null,
  spaceIds: string[],
  now: Date,
  seed: number,
): Part {
  if (count === 0) {
    return { quiet: { key: "jots", run: token("jots", listLink("jots")) } };
  }
  const jots = token(plural(count, "jot"), listLink("jots", spaceIds));
  const age = oldestAt ? differenceInCalendarDays(now, parseISO(oldestAt)) : 0;
  const tail =
    age >= 2
      ? pick(seed, SALT.jots, [`, oldest ${age} days old`, `, the oldest ${age} days old`] as const)
      : "";
  const templates: readonly string[] = [" to refine", " waiting to be refined", " in the queue"];
  return {
    clause: {
      key: "jots",
      icon: "📝",
      runs: [jots, text(pick(seed, SALT.jots, templates) + tail)],
    },
  };
}

// The lead

/// The one remark worth opening with: a session about to begin, an Exam today or
/// tomorrow, a fully clear day, or a nod to the weekday.
function leadFor(
  now: Date,
  upcoming: BriefingSession[],
  exams: Deadline[],
  today: string,
  allClear: boolean,
  seed: number,
): Run[] {
  const next = upcoming[0];
  if (next) {
    const wait = minutesOf(next.startTime) - (now.getHours() * 60 + now.getMinutes());
    if (wait > 0 && wait <= 90) {
      const course = name(
        next.courseTitle || next.title || "Untitled Session",
        entityLink(next.entityId, next.spaceId),
      );
      const when = token(
        wait < 60 ? `${plural(wait, "minute")}` : "an hour",
        entityLink(next.entityId, next.spaceId),
      );
      return [
        text(pick(seed, SALT.lead, ["Heads up: ", "Almost time: "] as const)),
        course,
        text(" starts in "),
        when,
        text("."),
      ];
    }
  }
  const soon = exams.find((e) => differenceInCalendarDays(parseDay(e.date), parseDay(today)) <= 1);
  if (soon) {
    const target = entityLink(soon.entity.id, soon.entity.spaceId);
    return [
      text(pick(seed, SALT.lead, ["Big day: ", "Good luck: "] as const)),
      name(displayTitle(soon.entity), target),
      text(" is "),
      token(dayWord(soon.date, today), target),
      text("."),
    ];
  }
  if (allClear) {
    return [
      text(
        pick(seed, SALT.lead, [
          "You're all caught up.",
          "You're all caught up, nothing is waiting.",
        ] as const),
      ),
    ];
  }
  const weekday = now.getDay();
  if (weekday === 5) return [text("Happy Friday.")];
  if (weekday === 1) return [text("A fresh week begins.")];
  if (weekday === 0 || weekday === 6) return [text("Enjoy the weekend.")];
  return [];
}

const QUIET_LEAD_IN = ["all quiet on ", "nothing waiting on ", "clear on "] as const;

function joinQuiet(items: Quiet[]): Run[] {
  return items.flatMap((item, i) => [
    ...(i === 0 ? [] : [text(i === items.length - 1 ? " and " : ", ")]),
    item.run,
  ]);
}

/// Builds the sentence from what is going on today. Sessions that already started are
/// left out, the parts with something to say come first in order of how soon they matter,
/// and every part with nothing in it folds into one closing clause of links. Phrasing
/// varies by calendar day, so it does not read the same every morning.
export function buildBriefing({
  name: who,
  sessions,
  tasks,
  deadlines,
  decks,
  jotCount,
  oldestJotAt,
  jotSpaceIds,
  now = new Date(),
}: BriefingInputs): Briefing {
  const seed = daySeed(now);
  const today = toDay(now);
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcoming = sessions.filter((s) => s.date === today && s.startTime.slice(0, 5) > clock);
  const finished = sessions.filter((s) => s.date === today).length - upcoming.length;
  const exams = collectUrgent(
    deadlines.filter((d) => d.kind === "exam"),
    today,
  );
  const assignments = collectUrgent(
    deadlines.filter((d) => d.kind === "assignment"),
    today,
  );

  const parts: Part[] = [
    sessionsPart(upcoming, finished, seed),
    tasksPart(tasks, today, seed),
    urgentPart("exams", "📚", "exam", "exams", exams, today, seed),
    urgentPart("assignments", "📄", "assignment", "assignments", assignments, today, seed),
    decksPart(decks, seed),
    jotsPart(jotCount, oldestJotAt, jotSpaceIds, now, seed),
  ];
  const allClear =
    upcoming.length === 0 &&
    tasks.length === 0 &&
    exams.length === 0 &&
    assignments.length === 0 &&
    decks.length === 0 &&
    jotCount === 0;
  const lead = leadFor(now, upcoming, exams, today, allClear, seed);
  const active = parts.flatMap((p) => ("clause" in p ? [p.clause] : []));
  const quiet = parts.flatMap((p) => ("quiet" in p ? [p.quiet] : []));
  // A single exam the lead already named is not said twice.
  const examId = exams.length === 1 ? exams[0].entity.id : null;
  const named = lead.some(
    (r) => r.kind === "name" && r.target.kind === "entity" && r.target.entityId === examId,
  );
  const clauses = named ? active.filter((c) => c.key !== "exams") : active;
  // Everything with nothing in it is named once, briefly, as links.
  if (quiet.length > 0) {
    clauses.push({
      key: "rest",
      icon: "✨",
      runs: [text(pick(seed, SALT.rest, QUIET_LEAD_IN)), ...joinQuiet(quiet)],
    });
  }

  const connectors = clauses
    .slice(1)
    .map((clause, i) =>
      clause.key === "rest"
        ? ". "
        : pick(seed, SALT.connector + i, [", ", ", plus ", ", and ", ". Also, "] as const),
    );
  const bridge =
    lead.length === 0
      ? ""
      : clauses[0]?.key === "rest"
        ? " "
        : pick(seed, SALT.lead + 1, [
            " Besides that, ",
            " Otherwise, ",
            " On top of that, ",
          ] as const);
  const worded = clauses.map((clause, i) => {
    const sentenceStart =
      i === 0 ? lead.length === 0 || bridge === " " : connectors[i - 1] === ". ";
    return sentenceStart ? { ...clause, runs: capitalize(clause.runs) } : clause;
  });
  return { greeting: greetingFor(now, who.trim()), lead, bridge, clauses: worded, connectors };
}
