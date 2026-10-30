import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeAssignment, makeEntity, makeSession, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { freezeTime } from "#/test/time.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { QuickAssignmentDialog } from "./QuickAssignmentDialog";

const course = makeEntity({ id: "course-1", type: "course", title: "Algo", key: "CRS-1" });
const running = makeSession(
  { date: "2026-03-10", startTime: "11:00", endTime: "13:00" },
  { id: "session-9", spaceId: "space-1" },
);
const link = (from: string, to: string, relationshipType: string) => ({
  id: `${from}-${to}`,
  fromEntityId: from,
  toEntityId: to,
  relationshipType,
  fromBlockId: null,
  toBlockId: null,
  createdAt: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  freezeTime("2026-03-10T12:00:00");
  useNavStore.setState({ newAssignmentOpen: false });
  mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Uni" })]);
  mockCommand("list_sessions_all", [running]);
  mockCommand("list_relationships", [link("session-9", "course-1", "session-course")]);
  mockCommand("get_entity", course);
  mockCommand("list_entities", [course]);
  mockCommand("list_courses", [course]);
  mockCommand("list_sessions", []);
  mockCommand("create_assignment", makeAssignment({}, { id: "asg-new" }));
  mockCommand("create_relationship", {});
  mockCommand("touch_entity_opened", null);
  act(() => useNavStore.getState().setActiveSpace("space-1"));
});

const courseButton = () => screen.findByRole("button", { name: "Change Course" });

describe("QuickAssignmentDialog", () => {
  it("opens with Cmd or Ctrl+Shift+A", async () => {
    const { user } = renderWithProviders(<QuickAssignmentDialog />);
    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    expect(useNavStore.getState().newAssignmentOpen).toBe(true);
    expect(await screen.findByRole("textbox", { name: "Assignment title" })).toBeInTheDocument();
  });

  it("starts in the course of the session that is running", async () => {
    renderWithProviders(<QuickAssignmentDialog />);
    act(() => useNavStore.getState().setNewAssignmentOpen(true));
    expect(await courseButton()).toHaveTextContent("Algo");
  });

  it("creates the assignment in that course and links it to the session", async () => {
    const { user } = renderWithProviders(<QuickAssignmentDialog />);
    act(() => useNavStore.getState().setNewAssignmentOpen(true));
    await waitFor(async () => expect(await courseButton()).toHaveTextContent("Algo"));
    await user.type(screen.getByRole("textbox", { name: "Assignment title" }), "Sheet 4");
    await user.click(screen.getByRole("button", { name: /Create assignment/ }));
    await waitFor(() => expect(callsOf("create_relationship")).toHaveLength(1));
    expect(callsOf("create_assignment")[0]).toMatchObject({
      spaceId: "space-1",
      title: "Sheet 4",
      courseId: "course-1",
    });
    expect(callsOf("create_relationship")[0]).toMatchObject({
      fromEntityId: "asg-new",
      toEntityId: "session-9",
      relationshipType: "relates-to",
    });
    await waitFor(() => expect(useNavStore.getState().newAssignmentOpen).toBe(false));
  });

  it("still opens when no session is running, with no course picked", async () => {
    mockCommand("list_sessions_all", []);
    renderWithProviders(<QuickAssignmentDialog />);
    act(() => useNavStore.getState().setNewAssignmentOpen(true));
    expect(await courseButton()).toHaveTextContent(/^Course$/);
    expect(callsOf("create_relationship")).toHaveLength(0);
  });

  it("opens empty again after it was closed without creating", async () => {
    const { user } = renderWithProviders(<QuickAssignmentDialog />);
    act(() => useNavStore.getState().setNewAssignmentOpen(true));
    await user.type(await screen.findByRole("textbox", { name: "Assignment title" }), "draft");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(useNavStore.getState().newAssignmentOpen).toBe(false));
    act(() => useNavStore.getState().setNewAssignmentOpen(true));
    expect(await screen.findByRole("textbox", { name: "Assignment title" })).toHaveValue("");
  });

  it("has no a11y violations", async () => {
    renderWithProviders(<QuickAssignmentDialog />);
    act(() => useNavStore.getState().setNewAssignmentOpen(true));
    await courseButton();
    await expectNoA11yViolations();
  });
});
