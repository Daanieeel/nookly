import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeEntity, makeTask } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { TaskDetailView } from "./TaskDetailView.tsx";

const entity = makeEntity({ id: "t1", type: "task", title: "Plan trip", spaceId: "shared-ada" });

beforeEach(() => {
  installTauriMock();
  mockCommand("get_task", makeTask({}, entity));
  mockCommand("list_blocks", []);
  mockCommand("list_subtasks", []);
});
afterEach(uninstallTauriMock);

describe("a task someone shared to view only", () => {
  it("can't be changed, so no edit is made only to be undone", async () => {
    mockCommand("sync_query", [{ role: "viewer" }]);
    renderWithProviders(<TaskDetailView entity={entity} />);
    expect(await screen.findByText(/Shared with you to view/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue("Plan trip")).toBeDisabled());
    const properties = screen.getByRole("region", { name: "Properties" });
    for (const button of properties.querySelectorAll("button")) expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add Sub-task" })).toBeNull();
  });

  it("stays editable for someone who may edit it", async () => {
    mockCommand("sync_query", [{ role: "editor" }]);
    renderWithProviders(<TaskDetailView entity={entity} />);
    await screen.findByRole("region", { name: "Properties" });
    expect(screen.getByDisplayValue("Plan trip")).toBeEnabled();
    expect(screen.queryByText(/Shared with you to view/)).toBeNull();
  });
});
