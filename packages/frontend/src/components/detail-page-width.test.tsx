import { waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssignmentDetailView } from "#/features/assignments/AssignmentDetailView.tsx";
import { CalendarEntryDetailView } from "#/features/calendar-entries/CalendarEntryDetailView.tsx";
import { ExamDetailView } from "#/features/exams/ExamDetailView.tsx";
import { PageDetailView } from "#/features/notes/PageDetailView.tsx";
import { SessionDetailView } from "#/features/sessions/SessionDetailView.tsx";
import { TaskDetailView } from "#/features/tasks/TaskDetailView.tsx";
import { renderWithProviders } from "#/test/render.tsx";
import { makeEntity, makeSession } from "#/test/fixtures.ts";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";

const PAGES: [string, ReactElement][] = [
  ["a task", <TaskDetailView entity={makeEntity({ type: "task" })} />],
  ["an assignment", <AssignmentDetailView entity={makeEntity({ type: "assignment" })} />],
  ["an exam", <ExamDetailView entity={makeEntity({ type: "exam" })} />],
  ["a session", <SessionDetailView entity={makeEntity({ id: "session-1", type: "session" })} />],
  ["a calendar entry", <CalendarEntryDetailView entity={makeEntity({ type: "calendar_entry" })} />],
];

/// The column a page lays its content out in, inside the layout's scrolling body.
async function bodyColumn(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector(".overflow-y-auto.p-4 > *")).not.toBeNull());
  return container.querySelector(".overflow-y-auto.p-4 > *");
}

describe("detail page width", () => {
  beforeEach(() => {
    installTauriMock();
    mockCommand("list_sessions", [makeSession()]);
    mockCommand("list_blocks", []);
  });
  afterEach(uninstallTauriMock);

  it.each(["note", "jot"])("keeps the centered page padding on a %s", async (type) => {
    const { container } = renderWithProviders(<PageDetailView entity={makeEntity({ type })} />);
    expect((await bodyColumn(container))?.className).toContain("max-w-3xl");
  });

  it.each(PAGES)("uses the full width on %s", async (_name, page) => {
    const { container } = renderWithProviders(page);
    const column = await bodyColumn(container);
    expect(column?.className).not.toContain("max-w-3xl");
    expect(column?.className).not.toContain("mx-auto");
  });

  it.each(["note", "jot"])("leaves a screen of room under the last block of a %s", async (type) => {
    const { container } = renderWithProviders(<PageDetailView entity={makeEntity({ type })} />);
    const editor = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(".tiptap-content");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(editor.style.paddingBottom).toBe("100vh");
  });

  // A calendar entry has no description editor.
  it.each(PAGES.filter(([name]) => name !== "a calendar entry"))(
    "adds no empty room under the editor on %s",
    async (_name, page) => {
      const { container } = renderWithProviders(page);
      const editor = await waitFor(() => {
        const found = container.querySelector<HTMLElement>(".tiptap-content");
        expect(found).not.toBeNull();
        return found!;
      });
      // The content below the editor (related items) sits right under it.
      expect(editor.style.paddingBottom).toBe("");
    },
  );
});
