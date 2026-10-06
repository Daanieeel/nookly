import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { describe, it } from "vitest";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { RepeatChip } from "#/components/repeat-chip.tsx";
import { TaskDisplayMenu } from "#/features/tasks/TaskDisplayMenu.tsx";
import { DEFAULT_DISPLAY } from "#/features/tasks/task-model.ts";
import { createCourse } from "#/lib/api/courses.ts";
import { DEFAULT_REPEAT } from "#/lib/repeat.ts";
import { qk } from "#/lib/query-keys.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { setDateTimeSettings } from "#/test/time.ts";
import { QuickCreateSessionDialog } from "#/features/sessions/calendar/QuickCreateSessionDialog.tsx";
import { QuickCreateTask } from "#/features/tasks/QuickCreateTask.tsx";
import { TasksDataContext } from "#/features/tasks/task-controls.tsx";
import { STATUSES } from "#/test/fixtures.ts";
import { CreateNameDialog } from "./CreateNameDialog.tsx";

// Each one is rendered open, the way a user meets it, and checked with axe.
describe("dialogs and menus have no axe violations", () => {
  it("CreateNameDialog", async () => {
    renderWithProviders(
      <CreateNameDialog
        open
        onOpenChange={() => {}}
        spaceId="space-1"
        heading="New Course"
        fieldId="course-name"
        placeholder="e.g. Algebra"
        emptyMessage="Give the course a name"
        create={createCourse}
        listKey={qk.courses.bySpace("space-1")}
        entitiesKey={qk.entities.bySpace("space-1")}
      />,
    );
    await expectNoA11yViolations();
  });

  it("QuickCreateSessionDialog", async () => {
    setDateTimeSettings({ timeFormat: "european", dateFormat: "american" });
    mockCommand("list_entities", [
      makeEntity({ id: "course-1", type: "course", title: "Algebra", key: "CRS-1" }),
    ]);
    renderWithProviders(
      <QuickCreateSessionDialog
        spaceId="space-1"
        draft={{ date: new Date(2026, 2, 11), startMin: 840, endMin: 930 }}
        onOpenChange={() => {}}
        onCreated={() => {}}
      />,
    );
    await expectNoA11yViolations();
  });

  it("QuickCreateTask", async () => {
    mockCommand("list_spaces", []);
    renderWithProviders(
      <TasksDataContext.Provider
        value={{
          spaceId: "space-1",
          statuses: STATUSES,
          labels: [],
          statusById: new Map(STATUSES.map((s) => [s.id, s])),
          labelById: new Map(),
          kindOf: () => "unstarted",
        }}
      >
        <QuickCreateTask
          open
          draft={{ related: makeEntity({ id: "c1", type: "course", title: "Algebra" }) }}
          onOpenChange={() => {}}
          onCreated={() => {}}
        />
      </TasksDataContext.Provider>,
    );
    await expectNoA11yViolations();
  });

  it("ConfirmPermanentDialog, with and without a phrase to type", async () => {
    for (const phrase of [undefined, "DELETE"]) {
      const { unmount } = renderWithProviders(
        <ConfirmPermanentDialog
          open
          onOpenChange={() => {}}
          title="Empty the Trash?"
          description="Everything in the Trash is erased for good. This cannot be undone."
          stats={[{ value: 4, label: "Items" }]}
          phrase={phrase}
          actionLabel="Delete 4 Forever"
          errorLabel="Couldn't empty, try again"
          status="idle"
          onConfirm={() => {}}
        />,
      );
      await expectNoA11yViolations();
      unmount();
    }
  });

  it("RepeatChip", async () => {
    render(<RepeatChip value={DEFAULT_REPEAT} onChange={() => {}} />);
    await expectNoA11yViolations();
  });

  it("TaskDisplayMenu, closed", async () => {
    renderTaskMenu();
    await expectNoA11yViolations();
  });

  // Known violations, reported and not fixed yet: the open panel has selects and a
  // switch without an accessible name. `it.fails` keeps this green while that is
  // true and turns red the day it is fixed, which is the cue to make it a plain `it`.
  it.fails("TaskDisplayMenu, open", async () => {
    renderTaskMenu();
    await userEvent.setup().click(screen.getByRole("button", { name: "Display" }));
    await screen.findByRole("dialog");
    await expectNoA11yViolations();
  });
});

function renderTaskMenu() {
  render(
    <TaskDisplayMenu
      display={{ ...DEFAULT_DISPLAY, layout: "board" }}
      onChange={() => {}}
      columns={[
        { id: "todo", name: "Todo" },
        { id: "done", name: "Done" },
      ]}
    />,
  );
}
