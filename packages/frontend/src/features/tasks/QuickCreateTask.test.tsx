import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeEntity, makeTask, STATUSES } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import { TasksDataContext, type TasksData } from "./task-controls";

const COURSE = makeEntity({ id: "course-1", type: "course", title: "Algebra", key: "CRS-1" });
const NOTE = makeEntity({ id: "note-1", type: "note", title: "Lecture notes", key: "NTE-1" });

const DATA: TasksData = {
  spaceId: "space-1",
  statuses: STATUSES,
  labels: [],
  statusById: new Map(STATUSES.map((s) => [s.id, s])),
  labelById: new Map(),
  kindOf: () => "unstarted",
};

function setup(draft: TaskDraft = {}) {
  mockCommand("list_entities", [COURSE, NOTE]);
  mockCommand("list_spaces", []);
  mockCommand("create_task", makeTask({}, { id: "task-new" }));
  mockCommand("create_relationship", {});
  mockCommand("update_task_status", null);
  mockCommand("list_tasks", []);
  mockCommand("list_tasks_all", []);
  const onCreated = vi.fn();
  const view = renderWithProviders(
    <TasksDataContext.Provider value={DATA}>
      <QuickCreateTask open draft={draft} onOpenChange={() => {}} onCreated={onCreated} />
    </TasksDataContext.Provider>,
  );
  return { ...view, onCreated };
}

describe("QuickCreateTask related picker", () => {
  it("creates a task with no relationship by default", async () => {
    const { user, onCreated } = setup();
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Read chapter");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_relationship")).toEqual([]);
  });

  it("relates the new task to the picked entity", async () => {
    const { user, onCreated } = setup();
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Read chapter");
    await user.click(screen.getByRole("button", { name: "Change Related" }));
    await user.click(await screen.findByRole("option", { name: /Lecture notes/ }));
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_relationship")).toEqual([
      expect.objectContaining({
        fromEntityId: "task-new",
        toEntityId: "note-1",
        relationshipType: "relates-to",
      }),
    ]);
  });

  it("starts on the course of the draft", async () => {
    const { user, onCreated } = setup({ related: COURSE });
    expect(screen.getByRole("button", { name: "Change Related" })).toHaveTextContent("Algebra");
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Problem set");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_relationship")).toEqual([
      expect.objectContaining({ toEntityId: "course-1", relationshipType: "relates-to" }),
    ]);
  });

  it("can clear the prefilled course", async () => {
    const { user, onCreated } = setup({ related: COURSE });
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Problem set");
    await user.click(screen.getByRole("button", { name: "Clear Related" }));
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_relationship")).toEqual([]);
  });
});
