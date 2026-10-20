import { type BriefingInputs, briefingText, buildBriefing } from "./briefing-runs.ts";

const now = new Date(2026, 9, 21, 10, 0);
const base: BriefingInputs = {
  name: "Ada",
  sessions: [],
  tasks: [],
  deadlines: [],
  decks: [],
  jotCount: 0,
  oldestJotAt: null,
  jotSpaceIds: [],
  now,
};

describe("the Dashboard's sentence", () => {
  it("greets by time of day and name", () => {
    expect(buildBriefing(base).greeting).toBe("Good morning, Ada");
    expect(buildBriefing({ ...base, name: "", now: new Date(2026, 9, 21, 20, 0) }).greeting).toBe(
      "Good evening",
    );
    expect(buildBriefing({ ...base, now: new Date(2026, 9, 21, 3, 0) }).mark).toBe("?");
  });

  it("says a clear day is clear, with every part as a link", () => {
    const b = buildBriefing(base);
    expect(b.lead.map((r) => r.text).join("")).toMatch(/all caught up/);
    const rest = b.clauses.at(-1);
    expect(rest?.key).toBe("rest");
    expect(rest?.runs.filter((r) => r.kind === "token").map((r) => r.text)).toEqual([
      "sessions",
      "tasks",
      "exams",
      "assignments",
      "decks",
      "jots",
    ]);
  });

  it("counts tasks due and overdue as tappable tokens that open the Tasks overview", () => {
    const b = buildBriefing({
      ...base,
      tasks: [
        { id: "t1", title: "Report", dueDate: "2026-10-21" },
        { id: "t2", title: "Email", dueDate: "2026-10-21" },
        { id: "t3", title: "Late", dueDate: "2026-10-18" },
      ],
    });
    const tasks = b.clauses.find((c) => c.key === "tasks");
    expect(tasks?.runs.map((r) => r.text).join("")).toBe("2 tasks due today and 1 overdue");
    expect(
      tasks?.runs.filter((r) => r.kind === "token").every((r) => r.target.kind === "overview"),
    ).toBe(true);
  });

  it("names a single deadline and links to the item, and opens with a session about to start", () => {
    const b = buildBriefing({
      ...base,
      sessions: [
        {
          id: "s1",
          spaceId: "sp",
          title: "",
          courseId: "c1",
          courseTitle: "Algorithms",
          date: "2026-10-21",
          startTime: "10:30",
        },
      ],
      deadlines: [
        { kind: "assignment", id: "a1", spaceId: "sp", title: "Sheet 3", date: "2026-10-22" },
      ],
    });
    expect(briefingText(b)).toContain("Algorithms starts in 30 minutes");
    const assignment = b.clauses.find((c) => c.key === "assignment");
    expect(assignment?.runs.some((r) => r.kind === "name" && r.text === "Sheet 3")).toBe(true);
  });

  it("is the same all day, and varies from day to day only in its wording", () => {
    const tasks = [{ id: "t1", title: "Report", dueDate: "2026-10-21" }];
    const morning = briefingText(buildBriefing({ ...base, tasks }));
    const evening = briefingText(
      buildBriefing({ ...base, tasks, now: new Date(2026, 9, 21, 15, 0) }),
    );
    expect(morning.replace("Good morning", "")).toBe(evening.replace("Good afternoon", ""));
  });
});
