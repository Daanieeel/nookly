import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeEntity, makeTask, STATUSES } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import { statusKind } from "./task-model";
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

function setup(draft: TaskDraft = {}, data: TasksData = DATA) {
  mockCommand("list_entities", [COURSE, NOTE]);
  mockCommand("list_spaces", []);
  mockCommand("create_task", makeTask({}, { id: "task-new" }));
  mockCommand("create_relationship", {});
  mockCommand("update_task_status", null);
  mockCommand("list_tasks", []);
  mockCommand("list_tasks_all", []);
  const onCreated = vi.fn();
  const view = renderWithProviders(
    <TasksDataContext.Provider value={data}>
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

  it("starts in Backlog, however the statuses are ordered", async () => {
    const shuffled = [STATUSES[2], STATUSES[1], STATUSES[0], STATUSES[3], STATUSES[4]];
    const sorted = [...STATUSES];
    const data: TasksData = {
      ...DATA,
      statuses: shuffled,
      statusById: new Map(shuffled.map((s) => [s.id, s])),
      kindOf: (id) => statusKind(DATA.statusById.get(id)!, sorted),
    };
    setup({}, data);
    expect(screen.getByRole("button", { name: "Change Status" })).toHaveTextContent("Backlog");
  });

  it.each(["Change Status", "Change Labels", "Change Due Date", "Change Related"])(
    "lets the %s popover scroll inside the dialog",
    async (trigger) => {
      // The dialog's scroll lock listens on the document and swallows wheel and touch
      // moves from anything outside the dialog, such as these popovers. They must stop
      // inside the popover so its list scrolls.
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: trigger }));
      await waitFor(() =>
        expect(document.querySelector("[data-radix-popper-content-wrapper] > *")).toBeTruthy(),
      );
      const inner = document.querySelector("[data-radix-popper-content-wrapper] > *")!;
      // In a small window it must shrink to the room it has instead of running off.
      expect(inner.className).toContain("--radix-popover-content-available-height");
      for (const type of ["wheel", "touchmove"]) {
        const reachedDocument = vi.fn();
        document.addEventListener(type, reachedDocument);
        inner.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        document.removeEventListener(type, reachedDocument);
        expect(reachedDocument, `${trigger} ${type}`).not.toHaveBeenCalled();
      }
    },
  );

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
