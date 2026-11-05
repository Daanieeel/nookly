import { act, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { AppToaster } from "./app-toaster.tsx";
import { trashEntity } from "./trash-entity.ts";

const note = makeEntity({ id: "note-1", type: "note", title: "Physics" });

describe("trashEntity", () => {
  beforeEach(() => {
    window.matchMedia = (media) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
    toast.dismiss();
  });

  it("moves the item to Trash at once and offers Undo in a toast", async () => {
    mockCommand("soft_delete_entity", null);
    const onTrashed = vi.fn();
    renderWithProviders(<AppToaster />);

    await act(() => trashEntity(note, { refresh: async () => {}, onTrashed }));

    expect(callsOf("soft_delete_entity")).toEqual([{ id: "note-1" }]);
    expect(onTrashed).toHaveBeenCalledOnce();
    expect(await screen.findByText("Note moved to Trash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("restores the item when Undo is pressed", async () => {
    mockCommand("soft_delete_entity", null);
    mockCommand("restore_entity", null);
    const refresh = vi.fn(async () => {});
    const onUndone = vi.fn();
    const { user } = renderWithProviders(<AppToaster />);

    await act(() => trashEntity(note, { refresh, onUndone }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(callsOf("restore_entity")).toEqual([{ id: "note-1" }]));
    await waitFor(() => expect(onUndone).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("says so when it could not move the item, and does not follow up", async () => {
    mockCommandWith("soft_delete_entity", () => {
      throw new Error("db locked");
    });
    const onTrashed = vi.fn();
    renderWithProviders(<AppToaster />);

    await act(() => trashEntity(note, { refresh: async () => {}, onTrashed }));

    expect(await screen.findByText("Couldn't move to Trash")).toBeInTheDocument();
    expect(onTrashed).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
