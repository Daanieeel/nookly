import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeEntity, makeSpace, makeTask, STATUSES } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { freezeTime } from "#/test/time.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import type { Space } from "#/lib/api/types.ts";
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

function setup(draft: TaskDraft = {}, data: TasksData = DATA, spaces: Space[] = []) {
  mockCommand("list_entities", [COURSE, NOTE]);
  mockCommand("list_spaces", spaces);
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

  it("offers six relative dates beside the calendar, with no search box", async () => {
    freezeTime("2026-03-11T12:00:00"); // a Wednesday
    const { user, onCreated } = setup();
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Read chapter");
    await user.click(screen.getByRole("button", { name: "Change Due Date" }));
    const labels = [
      "Today",
      "Tomorrow",
      "End of this week",
      "Next Monday",
      "In one week",
      "In two weeks",
    ];
    for (const label of labels) expect(await screen.findByText(label)).toBeInTheDocument();
    // The presets are a short list and a calendar: nothing to search.
    expect(screen.queryByPlaceholderText(/due date/i)).not.toBeInTheDocument();
    await user.click(screen.getByText("Next Monday"));
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_task")[0]).toMatchObject({ dueDate: "2026-03-16" });
  });

  it("picks two weeks out", async () => {
    freezeTime("2026-03-11T12:00:00");
    const { user, onCreated } = setup();
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Read chapter");
    await user.click(screen.getByRole("button", { name: "Change Due Date" }));
    await user.click(await screen.findByText("In two weeks"));
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_task")[0]).toMatchObject({ dueDate: "2026-03-25" });
  });

  it("clears every picked label from a Clear all row under the search box", async () => {
    const labels = [0, 1].map((i) => ({
      id: `label-${i}`,
      spaceId: "space-1",
      name: `Label ${i}`,
      color: "#64748b",
      createdAt: "2026-01-01T00:00:00Z",
      usageCount: 0,
    }));
    const data: TasksData = { ...DATA, labels, labelById: new Map(labels.map((l) => [l.id, l])) };
    mockCommand("attach_label", null);
    const { user, onCreated } = setup({}, data);
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Read chapter");
    await user.click(screen.getByRole("button", { name: "Change Labels" }));
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /Label 0/ }));
    await user.click(screen.getByRole("option", { name: /Label 1/ }));
    // Outside the scrolling list, so it stays put like the search box.
    const clear = screen.getByRole("button", { name: "Clear all" });
    expect(screen.getByRole("listbox").contains(clear)).toBe(false);
    await user.click(clear);
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("attach_label")).toEqual([]);
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
      for (const type of ["wheel", "touchmove"]) {
        const reachedDocument = vi.fn();
        document.addEventListener(type, reachedDocument);
        inner.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        document.removeEventListener(type, reachedDocument);
        expect(reachedDocument, `${trigger} ${type}`).not.toHaveBeenCalled();
      }
    },
  );

  it("shows the Space's icon and color in the dialog header", async () => {
    setup({}, DATA, [makeSpace({ id: "space-1", color: "#ff0000", icon: "🚀" })]);
    const name = await screen.findByText("Home");
    const mark = name.parentElement!;
    expect(mark).toHaveTextContent("🚀");
    expect(mark.querySelector("[style*='--space-color: #ff0000']")).toBeTruthy();
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
