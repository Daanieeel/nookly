import { screen, within } from "@testing-library/react";
import { addDays, format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarMenu, SidebarProvider } from "@nookly/ui/components/sidebar";
import { makeAssignment } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { nearestDueAssignment } from "./module-row-meta.tsx";
import { SidebarNavItems } from "./sidebar-items.tsx";

// jsdom has no matchMedia, which the sidebar uses to tell a phone from a desktop.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");

function setup(assignments: ReturnType<typeof makeAssignment>[]) {
  mockCommand("list_spaces", []);
  mockCommand("list_assignments_all_spaces", assignments);
  return renderWithProviders(
    <SidebarProvider>
      <SidebarMenu>
        <SidebarNavItems />
      </SidebarMenu>
    </SidebarProvider>,
  );
}

function rowOf(name: RegExp): HTMLElement {
  const row = screen.getByRole("button", { name }).closest("li");
  if (!row) throw new Error(`no sidebar row for ${name}`);
  return row;
}
const assignmentsRow = () => rowOf(/^Assignments/);

describe("nearestDueAssignment", () => {
  const today = new Date(2026, 2, 11);
  it("takes the earliest open assignment that is not past due", () => {
    const late = makeAssignment({ dueDate: "2026-03-20", status: "todo" });
    const soon = makeAssignment({ dueDate: "2026-03-12", status: "todo" });
    const past = makeAssignment({ dueDate: "2026-03-01", status: "todo" });
    const done = makeAssignment({ dueDate: "2026-03-11", status: "graded" });
    const undated = makeAssignment({ dueDate: null, status: "todo" });
    expect(nearestDueAssignment([late, soon, past, done, undated], today)).toBe(soon);
  });

  it("is undefined when nothing is coming up", () => {
    expect(nearestDueAssignment([], today)).toBeUndefined();
    expect(
      nearestDueAssignment([makeAssignment({ dueDate: "2026-03-01", status: "todo" })], today),
    ).toBeUndefined();
  });

  it("counts one due today", () => {
    const due = makeAssignment({ dueDate: "2026-03-11", status: "todo" });
    expect(nearestDueAssignment([due], today)).toBe(due);
  });
});

describe("the Assignments item of the sidebar", () => {
  it("shows when the next assignment across every Space is due", async () => {
    setup([
      makeAssignment({ dueDate: day(9), status: "todo" }, { id: "a1", spaceId: "space-1" }),
      makeAssignment({ dueDate: day(3), status: "todo" }, { id: "a2", spaceId: "space-2" }),
    ]);
    expect(await within(assignmentsRow()).findByText("3d")).toBeTruthy();
  });

  it("ignores done and past assignments", async () => {
    setup([
      makeAssignment({ dueDate: day(1), status: "graded" }, { id: "a1" }),
      makeAssignment({ dueDate: day(-2), status: "todo" }, { id: "a2" }),
      makeAssignment({ dueDate: day(5), status: "todo" }, { id: "a3" }),
    ]);
    expect(await within(assignmentsRow()).findByText("5d")).toBeTruthy();
    expect(within(assignmentsRow()).queryByText("1d")).toBeNull();
  });

  it("shows nothing extra when there is no upcoming assignment", async () => {
    setup([makeAssignment({ dueDate: day(-2), status: "todo" })]);
    const row = assignmentsRow();
    await screen.findByRole("button", { name: /^Assignments/ });
    expect(within(row).queryByText(/^\d+d$/)).toBeNull();
  });

  it("does not put a due date on the Tasks item", async () => {
    setup([makeAssignment({ dueDate: day(2), status: "todo" })]);
    const tasks = rowOf(/^Tasks/);
    await within(assignmentsRow()).findByText("2d");
    expect(within(tasks).queryByText("2d")).toBeNull();
  });
});
