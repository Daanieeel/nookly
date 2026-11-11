import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeSpace, makeTask, STATUSES } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { NewTaskDialog } from "./NewTaskDialog";

describe("NewTaskDialog", () => {
  beforeEach(() => {
    useNavStore.setState({ newTask: null });
    mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Uni" })]);
    mockCommand("list_task_statuses", STATUSES);
    mockCommand("list_labels", []);
    mockCommand("create_task", makeTask({}, { id: "task-new" }));
    mockCommand("update_task_status", null);
    mockCommand("list_tasks", []);
    mockCommand("list_tasks_all", []);
    act(() => useNavStore.getState().setActiveSpace("space-1"));
  });

  it("opens with the typed title, focused, so typing goes on from there", async () => {
    renderWithProviders(<NewTaskDialog />);
    act(() => useNavStore.getState().setNewTask({ spaceId: "space-1", title: "buy milk" }));
    const title = await screen.findByRole("textbox", { name: "Task title" });
    expect(title).toHaveValue("buy milk");
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("opens in the active Space with Cmd or Ctrl+Shift+T", async () => {
    const { user } = renderWithProviders(<NewTaskDialog />);
    // The dialog opens once it knows the Spaces.
    await waitFor(() => expect(callsOf("list_task_statuses")).not.toHaveLength(0));
    await user.keyboard("{Control>}{Shift>}t{/Shift}{/Control}");
    expect(useNavStore.getState().newTask).toEqual({ spaceId: "space-1", title: "" });
    expect(await screen.findByRole("textbox", { name: "Task title" })).toHaveValue("");
  });

  it("creates the task in its Space and closes", async () => {
    const { user } = renderWithProviders(<NewTaskDialog />);
    act(() => useNavStore.getState().setNewTask({ spaceId: "space-1", title: "" }));
    // The statuses load first, so the dialog starts in Backlog.
    const status = await screen.findByRole("button", { name: "Change Status" });
    await waitFor(() => expect(status).not.toHaveTextContent(/^Status$/));
    await user.type(await screen.findByRole("textbox", { name: "Task title" }), "Read chapter");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(useNavStore.getState().newTask).toBeNull());
    expect(callsOf("create_task")[0]).toMatchObject({ spaceId: "space-1", title: "Read chapter" });
  });
});
