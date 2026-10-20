/// The Dashboard's sentence, as the desktop builds it (`briefing-clauses.ts`): a greeting, an
/// opening remark about what stands out, then a clause for each part of the day that has
/// something in it, and one closing clause that names, as links, every part with nothing.
/// Every data backed run links somewhere: a `token` (a count, time or day) is bold
/// tappable text, a `name` (an item's title) a tappable name.

export type LinkTarget =
  | { kind: "entity"; id: string }
  | { kind: "list"; list: "sessions" | "exams" | "decks" | "jots"; spaceIds: string[] }
  | { kind: "overview"; view: "tasks" | "assignments" };

export type Run =
  | { kind: "text"; text: string }
  | { kind: "token"; text: string; target: LinkTarget }
  | { kind: "name"; text: string; target: LinkTarget };

const text = (value: string): Run => ({ kind: "text", text: value });
const token = (value: string, target: LinkTarget): Run => ({ kind: "token", text: value, target });
const name = (value: string, target: LinkTarget): Run => ({ kind: "name", text: value, target });
const entity = (id: string): LinkTarget => ({ kind: "entity", id });
const list = (l: "sessions" | "exams" | "decks" | "jots", spaceIds: string[] = []): LinkTarget => ({
  kind: "list",
  list: l,
  spaceIds,
});
const overview = (view: "tasks" | "assignments"): LinkTarget => ({ kind: "overview", view });

export interface Clause {
  key: string;
  icon: string;
  runs: Run[];
}

export interface BriefingSession {
  id: string;
  spaceId: string;
  title: string;
  courseId: string | null;
  courseTitle: string | null;
  date: string;
  startTime: string;
}

export interface BriefingTask {
  id: string;
  title: string;
  dueDate: string;
}

export interface Deadline {
  kind: "exam" | "assignment";
  id: string;
  spaceId: string;
  title: string;
  date: string;
}

export interface BriefingDeck {
  id: string;
  spaceId: string;
  title: string;
  cards: number;
}

export interface BriefingInputs {
  /// What to call the person; empty when they never said.
  name: string;
  /// Today's sessions, earliest first, including those that already started.
  sessions: BriefingSession[];
  /// Open tasks due today or overdue.
  tasks: BriefingTask[];
  /// Upcoming exams and assignments, soonest first.
  deadlines: Deadline[];
  decks: BriefingDeck[];
  jotCount: number;
  /// When the oldest unrefined jot was made.
  oldestJotAt: string | null;
  jotSpaceIds: string[];
  now?: Date;
}

export interface Briefing {
  /// "Good morning, Daniel", without the mark that ends it.
  greeting: string;
  /// What ends the greeting: "!" or, for the small hours, "?".
  mark: "!" | "?";
  lead: Run[];
  /// Text between the lead and the first clause; empty without a lead.
  bridge: string;
  clauses: Clause[];
  /// Connective text between each pair of adjacent clauses.
  connectors: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000,
  );
const shortDate = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const clockOf = (time: string) => time.slice(0, 5);

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

/// Stable per calendar day, so the phrasing varies day to day but never mid-day.
const daySeed = (now: Date) =>
  Number(`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`);

function pick<T>(seed: number, salt: number, options: readonly T[]): T {
  const n = seed + salt;
  return options[((n % options.length) + options.length) % options.length];
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function capitalize(runs: Run[]): Run[] {
  const [first, ...rest] = runs;
  if (first?.kind !== "text") return runs;
  return [text(first.text.charAt(0).toUpperCase() + first.text.slice(1)), ...rest];
}

const SALT = {
  sessions: 1,
  tasks: 2,
  exam: 3,
  assignment: 4,
  jots: 5,
  decks: 6,
  connector: 20,
  rest: 30,
  lead: 40,
};

interface Quiet {
  key: string;
  run: Run;
}
type Part = { clause: Clause } | { quiet: Quiet };

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

function sessionsPart(upcoming: BriefingSession[], finished: number, seed: number): Part {
  if (upcoming.length === 0 && finished === 0) {
    return { quiet: { key: "sessions", run: token("sessions", list("sessions")) } };
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
          token(plural(finished, "session"), list("sessions")),
          text(` ${finished === 1 ? "is" : "are"} ${done}`),
        ],
      },
    };
  }
  const next = upcoming[0];
  const course = name(
    next.courseTitle || next.title || "Untitled Session",
    entity(next.courseId ?? next.id),
  );
  const time = token(clockOf(next.startTime), entity(next.id));
  return {
    clause: { key: "sessions", icon: "📅", runs: [text("next up: "), course, text(" at "), time] },
  };
}

function tasksPart(tasks: BriefingTask[], today: string, seed: number): Part {
  if (tasks.length === 0) {
    return { quiet: { key: "tasks", run: token("tasks", overview("tasks")) } };
  }
  const overdue = tasks.filter((t) => t.dueDate < today);
  const dueToday = tasks.filter((t) => !overdue.includes(t));
  const list_ = overview("tasks");
  const one = (t: BriefingTask) => name(t.title || "Untitled", entity(t.id));
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
            token(plural(dueToday.length, "task"), list_),
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
            token(plural(overdue.length, "task"), list_),
            text(
              pick(seed, SALT.tasks, [
                " overdue to catch up on",
                " that slipped past their date",
              ] as const),
            ),
          ];
  } else {
    runs = [
      token(plural(dueToday.length, "task"), list_),
      text(" due today and "),
      token(`${overdue.length} overdue`, list_),
    ];
  }
  return { clause: { key: "tasks", icon: overdue.length > 0 ? "⏰" : "✅", runs } };
}

/// Deadlines due today, or failing that, within the next two days.
function collectUrgent(deadlines: Deadline[], today: string): Deadline[] {
  const dueToday = deadlines.filter((d) => d.date === today);
  return dueToday.length > 0 ? dueToday : deadlines.filter((d) => daysBetween(today, d.date) <= 2);
}

const dayWord = (date: string, today: string) => {
  const days = daysBetween(today, date);
  return days === 0 ? "today" : days === 1 ? "tomorrow" : shortDate(date);
};

function urgentPart(
  key: "exam" | "assignment",
  icon: string,
  quietText: string,
  items: Deadline[],
  today: string,
  seed: number,
): Part {
  if (items.length === 0) {
    const target = key === "assignment" ? overview("assignments") : list("exams");
    return { quiet: { key, run: token(quietText, target) } };
  }
  if (items.length === 1) {
    const item = items[0];
    const target = entity(item.id);
    const title = name(item.title || "Untitled", target);
    const day = token(dayWord(item.date, today), target);
    const templates: readonly Run[][] = [
      [title, text(` ${key} due `), day],
      [text(`your ${key} `), title, text(" is due "), day],
      [title, text(" is coming up "), day],
    ];
    return { clause: { key, icon, runs: pick(seed, SALT[key], templates) } };
  }
  const target =
    key === "assignment"
      ? overview("assignments")
      : list(
          "exams",
          items.map((d) => d.spaceId),
        );
  const count = token(plural(items.length, key), target);
  const templates: readonly Run[][] = [
    [count, text(" coming up")],
    [count, text(" on the way")],
    [count, text(" to keep an eye on")],
  ];
  return { clause: { key, icon, runs: pick(seed, SALT[key], templates) } };
}

function decksPart(decks: BriefingDeck[], seed: number): Part {
  if (decks.length === 0) return { quiet: { key: "decks", run: token("decks", list("decks")) } };
  const total = decks.reduce((sum, d) => sum + d.cards, 0);
  const target = list(
    "decks",
    decks.map((d) => d.spaceId),
  );
  const cards = token(plural(total, "card"), target);
  if (decks.length === 1) {
    const title = name(decks[0].title || "Untitled", entity(decks[0].id));
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
      runs: [cards, text(" ready to study across "), token(plural(decks.length, "deck"), target)],
    },
  };
}

function jotsPart(
  count: number,
  oldestAt: string | null,
  spaceIds: string[],
  now: Date,
  seed: number,
): Part {
  if (count === 0) return { quiet: { key: "jots", run: token("jots", list("jots")) } };
  const jots = token(plural(count, "jot"), list("jots", spaceIds));
  const age = oldestAt
    ? Math.floor((now.getTime() - new Date(oldestAt).getTime()) / 86_400_000)
    : 0;
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

/// The one remark worth opening with: a session about to begin, an exam today or tomorrow, a
/// fully clear day, or a nod to the weekday.
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
      const course = name(next.courseTitle || next.title || "Untitled Session", entity(next.id));
      const when = token(wait < 60 ? plural(wait, "minute") : "an hour", entity(next.id));
      return [
        text(pick(seed, SALT.lead, ["Heads up: ", "Almost time: "] as const)),
        course,
        text(" starts in "),
        when,
        text("."),
      ];
    }
  }
  const soon = exams.find((e) => daysBetween(today, e.date) <= 1);
  if (soon) {
    const target = entity(soon.id);
    return [
      text(pick(seed, SALT.lead, ["Big day: ", "Good luck: "] as const)),
      name(soon.title || "Untitled", target),
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

/// Builds the sentence from what is going on today. Sessions that already started are left
/// out, the parts with something to say come first, and every part with nothing in it folds
/// into one closing clause of links. Phrasing varies by calendar day.
export function buildBriefing(input: BriefingInputs): Briefing {
  const now = input.now ?? new Date();
  const seed = daySeed(now);
  const today = toDay(now);
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const upcoming = input.sessions.filter(
    (s) => s.date === today && s.startTime.slice(0, 5) > clock,
  );
  const finished = input.sessions.filter((s) => s.date === today).length - upcoming.length;
  const exams = collectUrgent(
    input.deadlines.filter((d) => d.kind === "exam"),
    today,
  );
  const assignments = collectUrgent(
    input.deadlines.filter((d) => d.kind === "assignment"),
    today,
  );
  const parts: Part[] = [
    sessionsPart(upcoming, finished, seed),
    tasksPart(input.tasks, today, seed),
    urgentPart("exam", "📚", "exams", exams, today, seed),
    urgentPart("assignment", "📄", "assignments", assignments, today, seed),
    decksPart(input.decks, seed),
    jotsPart(input.jotCount, input.oldestJotAt, input.jotSpaceIds, now, seed),
  ];
  const allClear =
    upcoming.length === 0 &&
    input.tasks.length === 0 &&
    exams.length === 0 &&
    assignments.length === 0 &&
    input.decks.length === 0 &&
    input.jotCount === 0;
  const lead = leadFor(now, upcoming, exams, today, allClear, seed);
  const active = parts.flatMap((p) => ("clause" in p ? [p.clause] : []));
  const quiet = parts.flatMap((p) => ("quiet" in p ? [p.quiet] : []));
  // A single exam the lead already named is not said twice.
  const examId = exams.length === 1 ? exams[0].id : null;
  const named = lead.some(
    (r) => r.kind === "name" && r.target.kind === "entity" && r.target.id === examId,
  );
  const clauses = named ? active.filter((c) => c.key !== "exam") : active;
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
  return {
    greeting: greetingFor(now, input.name.trim()),
    mark: now.getHours() < 5 ? "?" : "!",
    lead,
    bridge,
    clauses: worded,
    connectors,
  };
}

/// The briefing as plain text, for a screen reader and a test.
export function briefingText(b: Briefing): string {
  const runs = (rs: Run[]) => rs.map((r) => r.text).join("");
  const body = b.clauses
    .map((c, i) => `${i > 0 ? b.connectors[i - 1] : ""}${runs(c.runs)}`)
    .join("");
  return `${b.greeting}${b.mark} ${runs(b.lead)}${b.bridge}${body}.`.replace(/\s+/g, " ");
}
