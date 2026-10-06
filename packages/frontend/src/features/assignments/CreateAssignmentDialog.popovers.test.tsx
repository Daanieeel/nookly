import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAssignment, makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { freezeTime } from "#/test/time.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { CreateAssignmentDialog } from "./AssignmentsListView.tsx";

const course = makeEntity({ id: "course-1", type: "course", title: "Algo" });

beforeEach(() => {
  freezeTime("2026-03-11T12:00:00"); // a Wednesday
  mockCommand("list_spaces", [makeSpace({ id: "space-1", color: "#ff0000", icon: "🚀" })]);
  mockCommand("list_entities", [course]);
  mockCommand("list_courses", [course]);
  mockCommand("list_relationships", []);
  mockCommand("create_assignment", makeAssignment());
});

function renderDialog() {
  return renderWithProviders(
    <CreateAssignmentDialog spaceId="space-1" open onOpenChange={() => {}} />,
  );
}

describe("CreateAssignmentDialog popovers", () => {
  it.each(["Change Course", "Change Due Date"])(
    "lets the %s popover scroll inside the dialog",
    async (trigger) => {
      // The dialog's scroll lock swallows wheel and touch moves from portaled popovers.
      const { user } = renderDialog();
      await user.click(await screen.findByRole("button", { name: trigger }));
      await waitFor(() =>
        expect(document.querySelector("[data-radix-popper-content-wrapper] > *")).toBeTruthy(),
      );
      const inner = document.querySelector("[data-radix-popper-content-wrapper] > *")!;
      for (const type of ["wheel", "touchmove"]) {
        const reachedDocument = vi.fn();
        document.addEventListener(type, reachedDocument);
        inner.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        document.removeEventListener(type, reachedDocument);
        expect(reachedDocument, `${trigger} ${type}`).not.toHaveBeenCalled();
      }
    },
  );

  it("offers seven relative dates beside the calendar, with no search box", async () => {
    const { user } = renderDialog();
    await user.click(await screen.findByRole("button", { name: "Change Due Date" }));
    for (const label of [
      "Today",
      "Tomorrow",
      "End of this week",
      "Next Monday",
      "In one week",
      "In two weeks",
      "In one month",
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByPlaceholderText(/due date/i)).not.toBeInTheDocument();
  });

  it("creates with the picked relative date", async () => {
    const { user } = renderDialog();
    await user.click(await screen.findByRole("button", { name: "Change Course" }));
    await user.click(await screen.findByText("Algo", { selector: "span" }));
    await user.click(screen.getByRole("button", { name: "Change Due Date" }));
    await user.click(await screen.findByText("In two weeks"));
    await user.click(screen.getByRole("button", { name: /Create assignment/ }));
    await waitFor(() => expect(callsOf("create_assignment")).toHaveLength(1));
    expect(callsOf("create_assignment")[0]).toMatchObject({ dueDate: "2026-03-25" });
  });

  it("shows the Space's icon and color in the dialog header", async () => {
    renderDialog();
    const name = await screen.findByText("Home");
    const mark = name.parentElement!;
    expect(mark).toHaveTextContent("🚀");
    expect(mark.querySelector("[style*='--space-color: #ff0000']")).toBeTruthy();
  });
});
