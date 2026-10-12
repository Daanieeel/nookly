import { describe, expect, it } from "vitest";
import type { BriefingSession, Entity, Task } from "#/lib/api/types.ts";
import { type BriefingInputs, type Run, buildBriefing } from "./briefing-clauses";

// Monday 12 Oct 2026, 10:00.
const NOW = new Date(2026, 9, 12, 10, 0);

function session(startTime: string, title = "Algorithms"): BriefingSession {
  return {
    entityId: `s-${startTime}`,
    title,
    date: "2026-10-12",
    startTime,
    courseId: null,
    courseTitle: title,
    spaceId: "space",
  };
}

function task(id: string, dueDate: string): Task {
  return {
    // SAFETY: the briefing only reads the id and space of an entity.
    entity: { id, spaceId: "space", title: id } as Entity,
    statusId: "todo",
    startDate: null,
    dueDate,
    labelIds: [],
    completedAt: null,
    effort: null,
    repeat: null,
    courseIds: [],
    semesterIds: [],
  };
}

const EMPTY: BriefingInputs = {
  name: "",
  sessions: [],
  tasks: [],
  deadlines: [],
  decks: [],
  jotCount: 0,
  oldestJotAt: null,
  jotSpaceIds: [],
  now: NOW,
};

const glue = (value: string): Run => ({ kind: "text", text: value });
const flat = (runs: Run[]) => runs.map((r) => r.text).join("");
function sentence(inputs: Partial<BriefingInputs>) {
  const b = buildBriefing({ ...EMPTY, ...inputs });
  const parts = [b.lead, ...b.clauses.flatMap((c, i) => [c.runs, [glue(b.connectors[i] ?? "")]])];
  return { briefing: b, text: `${b.greeting}! ${parts.map(flat).join("")}` };
}
const linked = (runs: Run[]) => runs.filter((r) => r.kind !== "text");

describe("buildBriefing", () => {
  it("greets by name and time of day", () => {
    expect(sentence({ name: "Daniel" }).briefing.greeting).toBe("Good morning, Daniel");
    expect(sentence({}).briefing.greeting).toBe("Good morning");
    expect(sentence({ name: "Daniel", now: new Date(2026, 9, 12, 20) }).briefing.greeting).toBe(
      "Good evening, Daniel",
    );
  });

  it("leaves out sessions that already started", () => {
    const { text } = sentence({
      sessions: [
        session("08:00", "Early"),
        session("09:59", "Just started"),
        session("14:00", "Later"),
      ],
    });
    expect(text).not.toContain("Early");
    expect(text).not.toContain("Just started");
    expect(text).toContain("Later");
    expect(text).toContain("1 session");
  });

  it("says the sessions are done once every one has started", () => {
    const { text, briefing } = sentence({ sessions: [session("08:00"), session("09:00")] });
    expect(text).not.toContain("Algorithms");
    expect(text.toLowerCase()).toContain("done");
    const sessions = briefing.clauses.find((c) => c.key === "sessions");
    expect(linked(sessions?.runs ?? [])).not.toHaveLength(0);
  });

  it("leads with a session that is about to begin", () => {
    const { briefing } = sentence({ sessions: [session("10:25")] });
    expect(flat(briefing.lead)).toContain("25 minutes");
  });

  it("does not lead with a session that is hours away", () => {
    const { briefing } = sentence({ sessions: [session("16:00")] });
    expect(flat(briefing.lead)).not.toContain("minutes");
  });

  it("tells overdue tasks from those due today", () => {
    const { text } = sentence({
      tasks: [task("a", "2026-10-09"), task("b", "2026-10-12"), task("c", "2026-10-12")],
    });
    expect(text).toContain("2 tasks");
    expect(text).toContain("1 overdue");
  });

  it("phrases empty parts nicely, each one a link", () => {
    const { briefing, text } = sentence({ name: "Daniel" });
    expect(text).not.toMatch(/\b0 /);
    const rest = briefing.clauses.at(-1);
    expect(rest?.key).toBe("rest");
    expect(linked(rest?.runs ?? []).length).toBeGreaterThanOrEqual(5);
    expect(linked(rest?.runs ?? []).every((r) => r.kind === "token")).toBe(true);
  });

  it("calls it a clear day when nothing is waiting", () => {
    expect(flat(sentence({}).briefing.lead).toLowerCase()).toContain("caught up");
  });

  it("mentions the cards to study and the oldest jot", () => {
    const { text } = sentence({
      decks: [{ entityId: "d", spaceId: "space", title: "Rechengesetze", cards: 26 }],
      jotCount: 3,
      oldestJotAt: "2026-10-02T09:00:00Z",
      jotSpaceIds: ["space"],
    });
    expect(text).toContain("26 cards");
    expect(text).toContain("Rechengesetze");
    expect(text).toContain("3 jots");
    expect(text).toMatch(/10 days/);
  });
});
