import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatDate } from "#/lib/datetime.ts";
import { makeAssignment, makeEntity, makeSession } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { freezeTime } from "#/test/time.ts";
import { mockCommand } from "#/test/tauri.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { AssignmentDuePicker, DuePicker } from "./AssignmentDuePicker.tsx";
import type { AssignmentDue } from "./assignment-model";

async function open(assignment: Assignment = makeAssignment()) {
  const onSelect = vi.fn<(due: AssignmentDue) => void>();
  const { user } = renderWithProviders(
    <AssignmentDuePicker assignment={assignment} onSelect={onSelect}>
      <button type="button">Due</button>
    </AssignmentDuePicker>,
  );
  await user.click(screen.getByRole("button", { name: "Due" }));
  return { onSelect, user };
}

describe("AssignmentDuePicker", () => {
  it("first asks what the due date is based on", async () => {
    await open();
    expect(screen.getByRole("button", { name: /^Specific date/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Before session/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Specific session/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear due date" })).not.toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("opens with nothing picked or focused in the cards", async () => {
    await open();
    const first = screen.getByRole("button", { name: /^Specific date/ });
    expect(first).not.toHaveFocus();
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Before session/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks which kind the due date is", async () => {
    await open(makeAssignment({ dueDate: "2026-03-08", dueSessionOffsetDays: 2 }));
    expect(screen.getByRole("button", { name: /^Before session/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Specific date/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("picks a specific date with the usual presets and calendar, without a search box", async () => {
    const { onSelect, user } = await open(makeAssignment({ dueDate: "2026-03-10" }));
    await user.click(screen.getByRole("button", { name: /^Specific date/ }));
    expect(await screen.findByText("Tomorrow")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Set due date…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("gridcell", { name: formatDate(new Date(2026, 2, 20)) }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "date", day: "2026-03-20" });
  });

  it("asks how many days before the next session, starting on the day of it", async () => {
    const { onSelect, user } = await open();
    await user.click(screen.getByRole("button", { name: /^Before session/ }));
    expect(await screen.findByRole("spinbutton")).toHaveValue(0);
    await user.click(screen.getByRole("button", { name: "Set" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "session", offsetDays: 0 });
  });

  it("offers common offsets in one click", async () => {
    const { onSelect, user } = await open();
    await user.click(screen.getByRole("button", { name: /^Before session/ }));
    await user.click(await screen.findByRole("button", { name: "1 week" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "session", offsetDays: 7 });
  });

  it("starts from the days it is already set to", async () => {
    const { onSelect, user } = await open(
      makeAssignment({ dueDate: "2026-03-08", dueSessionOffsetDays: 2 }),
    );
    await user.click(screen.getByRole("button", { name: /^Before session/ }));
    expect(await screen.findByRole("spinbutton")).toHaveValue(2);
    await user.click(screen.getByRole("button", { name: "Set" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "session", offsetDays: 2 });
  });

  it("goes back to the choice", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: /^Before session/ }));
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /^Specific date/ })).toBeInTheDocument();
  });

  it("clears the due date, whichever kind it is", async () => {
    const { onSelect, user } = await open(
      makeAssignment({ dueDate: "2026-03-08", dueSessionOffsetDays: 2 }),
    );
    await user.click(screen.getByRole("button", { name: "Clear due date" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "date", day: null });
  });

  describe("specific session", () => {
    const course = makeEntity({ id: "course-1", type: "course", title: "Algo" });
    const rel = (from: string) => ({
      id: `rel-${from}`,
      fromEntityId: from,
      toEntityId: course.id,
      relationshipType: from.startsWith("s") ? "session-course" : "assignment-course",
      fromBlockId: null,
      toBlockId: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    function backend() {
      freezeTime("2026-03-10T12:00:00");
      mockCommand("list_courses", [course]);
      mockCommand("list_relationships", [
        rel("entity-1"),
        rel("s-past"),
        rel("s-next"),
        rel("s-later"),
        rel("s-off"),
      ]);
      mockCommand("list_sessions", [
        makeSession({ date: "2026-03-03" }, { id: "s-past" }),
        makeSession({ date: "2026-03-12", startTime: "09:00" }, { id: "s-next", title: "Graphs" }),
        makeSession(
          { date: "2026-03-19", startTime: "14:00" },
          { id: "s-later", title: "Dynamic programming" },
        ),
        makeSession({ date: "2026-03-26", cancelled: true }, { id: "s-off" }),
      ]);
    }

    it("lists only the course's upcoming sessions and follows the one picked", async () => {
      backend();
      const { onSelect, user } = await open();
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      const list = await screen.findByRole("list", { name: "Upcoming sessions" });
      expect(list.querySelectorAll("li")).toHaveLength(2);
      await user.click(await screen.findByRole("button", { name: /Mar 19/ }));
      await user.click(screen.getByRole("button", { name: "Day of" }));
      expect(onSelect).toHaveBeenCalledWith({
        kind: "session",
        offsetDays: 0,
        sessionId: "s-later",
      });
    });

    it("shows each session's name next to its date", async () => {
      backend();
      const { user } = await open();
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      expect(await screen.findByText("Graphs")).toBeInTheDocument();
      expect(screen.getByText("Dynamic programming")).toBeInTheDocument();
    });

    it("offers the same spans as the next session, one click for a common one", async () => {
      backend();
      const { onSelect, user } = await open();
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      await user.click(await screen.findByRole("button", { name: /Mar 12/ }));
      await user.click(screen.getByRole("button", { name: "1 week" }));
      expect(onSelect).toHaveBeenCalledWith({
        kind: "session",
        offsetDays: 7,
        sessionId: "s-next",
      });
    });

    it("can set any number of days before the picked session", async () => {
      backend();
      const { onSelect, user } = await open();
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      await user.click(await screen.findByRole("button", { name: /Mar 12/ }));
      const days = screen.getByRole("spinbutton");
      await user.clear(days);
      await user.type(days, "2");
      await user.click(screen.getByRole("button", { name: "Set" }));
      expect(onSelect).toHaveBeenCalledWith({
        kind: "session",
        offsetDays: 2,
        sessionId: "s-next",
      });
    });

    it("needs a session picked before a span can be chosen", async () => {
      backend();
      const { onSelect, user } = await open();
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      await screen.findByRole("list", { name: "Upcoming sessions" });
      expect(screen.getByRole("button", { name: "1 week" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Set" })).toBeDisabled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("says so when the course has no upcoming sessions", async () => {
      mockCommand("list_courses", [course]);
      mockCommand("list_relationships", [rel("entity-1"), rel("s-past")]);
      mockCommand("list_sessions", [makeSession({ date: "2000-01-01" }, { id: "s-past" })]);
      const { user } = await open();
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      expect(await screen.findByText("This course has no upcoming sessions.")).toBeInTheDocument();
    });

    it("asks for a course first when a new assignment has none", async () => {
      mockCommand("list_courses", []);
      mockCommand("list_sessions", []);
      const onSelect = vi.fn<(due: AssignmentDue) => void>();
      const { user } = renderWithProviders(
        <DuePicker
          value={{ dueDate: null, dueSessionOffsetDays: null, dueSessionId: null }}
          spaceId="space-1"
          onSelect={onSelect}
        >
          <button type="button">Due</button>
        </DuePicker>,
      );
      await user.click(screen.getByRole("button", { name: "Due" }));
      await user.click(screen.getByRole("button", { name: /^Specific session/ }));
      expect(await screen.findByText("Pick a course first.")).toBeInTheDocument();
    });
  });
});
