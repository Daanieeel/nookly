import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createCourse } from "#/lib/api/courses.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { CreateNameDialog } from "./CreateNameDialog.tsx";

function setup() {
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <CreateNameDialog
      open
      onOpenChange={onOpenChange}
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
  return { ...view, onOpenChange };
}

describe("CreateNameDialog", () => {
  it("focuses the name field when it opens", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "New Course" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Algebra")).toHaveFocus();
  });

  it("creates the entity with a trimmed name, refreshes the lists and opens it", async () => {
    mockCommand("create_course", makeEntity({ id: "course-9", type: "course", title: "Algebra" }));
    mockCommand("touch_entity_opened", null);
    const { user, onOpenChange, queryClient } = setup();
    queryClient.setQueryData(qk.courses.bySpace("space-1"), []);
    queryClient.setQueryData(qk.entities.noteSummaries("space-1"), []);
    await user.type(screen.getByPlaceholderText("e.g. Algebra"), "  Algebra  ");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(callsOf("create_course")).toEqual([{ spaceId: "space-1", title: "Algebra" }]);
    expect(useNavStore.getState().view).toEqual({
      kind: "entity",
      entityId: "course-9",
      spaceId: "space-1",
    });
    expect(queryClient.getQueryState(qk.courses.bySpace("space-1"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.entities.noteSummaries("space-1"))?.isInvalidated).toBe(
      true,
    );
  });

  it("submits with Enter", async () => {
    mockCommand("create_course", makeEntity({ id: "course-2" }));
    mockCommand("touch_entity_opened", null);
    const { user, onOpenChange } = setup();
    await user.type(screen.getByPlaceholderText("e.g. Algebra"), "Physics{Enter}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(callsOf("create_course")).toEqual([{ spaceId: "space-1", title: "Physics" }]);
  });

  it("never calls the backend for an empty name", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the course a name");
    expect(callsOf("create_course")).toEqual([]);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("stays open and offers a retry when creating fails", async () => {
    mockCommandWith("create_course", () => {
      throw new Error("disk full");
    });
    const { user, onOpenChange } = setup();
    await user.type(screen.getByPlaceholderText("e.g. Algebra"), "Algebra");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("button", { name: /Couldn't create, try again/ })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
