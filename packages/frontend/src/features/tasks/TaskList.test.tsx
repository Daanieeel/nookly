import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeLabel, makeSpace, makeTask, STATUSES } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { TaskRow } from "./TaskList";
import { ScopedTasksData } from "./task-controls";

describe("TaskRow", () => {
  beforeEach(() => {
    mockCommand("list_spaces", [makeSpace({ id: "space-1" })]);
    mockCommand("list_task_statuses", STATUSES);
    mockCommand("list_labels", [makeLabel()]);
  });

  it("is left unrendered while scrolled out of view, so a long list stays cheap for dialogs", async () => {
    // Opening a dialog makes the browser restyle every element on the page; rows far off screen
    // are skipped, which kept the New task dialog opening and closing in over a second.
    renderWithProviders(
      <ScopedTasksData spaceId="space-1">
        <TaskRow
          task={makeTask({}, { title: "Read" })}
          properties={[]}
          highlighted={false}
          onOpen={() => {}}
        />
      </ScopedTasksData>,
    );
    const row = (await screen.findByRole("button", { name: "Open Read" })).parentElement;
    expect(row).toHaveClass("skip-offscreen");
  });
});
