import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { formatDate } from "#/lib/datetime.ts";
import { makeAssignment } from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { AssignmentDuePicker } from "./AssignmentDuePicker.tsx";
import type { AssignmentDue } from "./assignment-model";

async function open(assignment: Assignment = makeAssignment()) {
  const onSelect = vi.fn<(due: AssignmentDue) => void>();
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <AssignmentDuePicker assignment={assignment} onSelect={onSelect}>
        <button type="button">Due</button>
      </AssignmentDuePicker>
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Due" }));
  return { onSelect, user };
}

describe("AssignmentDuePicker", () => {
  it("first asks what the due date is based on", async () => {
    await open();
    expect(screen.getByRole("button", { name: /^Specific date/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Before session/ })).toBeInTheDocument();
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
});
