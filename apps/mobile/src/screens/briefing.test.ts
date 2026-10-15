import { briefing, greetingFor } from "./briefing.ts";

const empty = {
  name: "",
  now: new Date(2026, 9, 15, 9),
  sessionsToday: 0,
  entriesToday: 0,
  tasksDue: 0,
  tasksOverdue: 0,
  deadlines: 0,
  cardsDue: 0,
  jotsToRefine: 0,
};

describe("the dashboard briefing", () => {
  it("greets by the hour, with the name when there is one", () => {
    expect(greetingFor(new Date(2026, 9, 15, 3), "")).toBe("Still up");
    expect(greetingFor(new Date(2026, 9, 15, 9), "Ada")).toBe("Good morning, Ada");
    expect(greetingFor(new Date(2026, 9, 15, 14), " ")).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 9, 15, 20), "Ada")).toBe("Good evening, Ada");
  });

  it("says plainly when there is nothing", () => {
    expect(briefing(empty).text).toBe("Nothing is on your plate today.");
  });

  it("lists the day, then what else waits, with the right plurals", () => {
    expect(
      briefing({
        ...empty,
        sessionsToday: 2,
        tasksDue: 1,
        tasksOverdue: 3,
        cardsDue: 12,
        jotsToRefine: 1,
      }).text,
    ).toBe(
      "Today you have 2 sessions and 1 task due. Also 3 overdue, 12 cards to study and 1 jot to refine.",
    );
    expect(briefing({ ...empty, entriesToday: 1 }).text).toBe("Today you have 1 event.");
    expect(briefing({ ...empty, deadlines: 2 }).text).toBe(
      "There are 2 exams and assignments coming up.",
    );
    expect(briefing({ ...empty, sessionsToday: 1, entriesToday: 2, tasksDue: 3 }).text).toBe(
      "Today you have 1 session, 2 events and 3 tasks due.",
    );
  });
});
