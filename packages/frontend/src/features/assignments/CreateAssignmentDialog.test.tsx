import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeAssignment, makeEntity, makeSession, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { freezeTime } from "#/test/time.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { CreateAssignmentDialog } from "./AssignmentsListView.tsx";

const course = makeEntity({ id: "course-1", type: "course", title: "Algo" });

beforeEach(() => {
  freezeTime("2026-03-10T12:00:00");
  mockCommand("list_spaces", [makeSpace()]);
  mockCommand("list_entities", [course]);
  mockCommand("list_courses", [course]);
  mockCommand("list_relationships", []);
  mockCommand("list_sessions", [makeSession({ date: "2026-03-19" }, { id: "s-1" })]);
  mockCommand("create_assignment", makeAssignment());
});

async function openDialog() {
  const view = renderWithProviders(
    <CreateAssignmentDialog spaceId="space-1" open onOpenChange={() => {}} />,
  );
  await view.user.click(await screen.findByRole("button", { name: "Change Course" }));
  await view.user.click(await screen.findByText("Algo", { selector: "span" }));
  return view;
}

describe("CreateAssignmentDialog due date", () => {
  it("has no a11y violations", async () => {
    renderWithProviders(<CreateAssignmentDialog spaceId="space-1" open onOpenChange={() => {}} />);
    await screen.findByRole("button", { name: "Change Due Date" });
    await expectNoA11yViolations();
  });

  it("can be set to follow the next session", async () => {
    const { user } = await openDialog();
    await user.click(screen.getByRole("button", { name: "Change Due Date" }));
    await user.click(await screen.findByRole("button", { name: /^Before session/ }));
    await user.click(await screen.findByRole("button", { name: "1 week" }));
    expect(screen.getByRole("button", { name: "Change Due Date" })).toHaveTextContent(
      "7d before session",
    );
    await user.click(screen.getByRole("button", { name: /Create assignment/ }));
    await waitFor(() => expect(callsOf("create_assignment")).toHaveLength(1));
    expect(callsOf("create_assignment")[0]).toMatchObject({
      courseId: "course-1",
      dueDate: null,
      dueSessionOffsetDays: 7,
    });
  });

  it("can be set to a specific session of the picked course", async () => {
    const { user } = await openDialog();
    mockCommand("list_relationships", [
      {
        id: "r1",
        fromEntityId: "s-1",
        toEntityId: "course-1",
        relationshipType: "session-course",
        fromBlockId: null,
        toBlockId: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    await user.click(screen.getByRole("button", { name: "Change Due Date" }));
    await user.click(await screen.findByRole("button", { name: /^Specific session/ }));
    await user.click(await screen.findByRole("button", { name: /Mar 19/ }));
    await user.click(screen.getByRole("button", { name: /Create assignment/ }));
    await waitFor(() => expect(callsOf("create_assignment")).toHaveLength(1));
    expect(callsOf("create_assignment")[0]).toMatchObject({
      dueDate: null,
      dueSessionOffsetDays: 0,
      dueSessionId: "s-1",
    });
  });
});
