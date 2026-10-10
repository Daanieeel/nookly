import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { CommandsPalette } from "./commands-palette.tsx";

describe("Import Page from File in the commands palette", () => {
  it("imports the picked file into the active Space and opens the new page", async () => {
    mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Uni" })]);
    mockCommand("list_space_modules", ["notes"]);
    mockCommand("plugin:dialog|open", "/tmp/shared.nookly.json");
    mockCommand(
      "import_page_json",
      makeEntity({ id: "new-1", spaceId: "space-1", type: "note", title: "Shared" }),
    );
    mockCommand("touch_entity_opened", null);
    act(() => useNavStore.getState().setActiveSpace("space-1"));
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "import page");
    await user.click(await screen.findByText("Import Page from File"));
    await waitFor(() => expect(callsOf("import_page_json")).toHaveLength(1));
    expect(callsOf("import_page_json")[0]).toEqual({
      spaceId: "space-1",
      path: "/tmp/shared.nookly.json",
    });
    await waitFor(() =>
      expect(useNavStore.getState().view).toEqual({
        kind: "entity",
        entityId: "new-1",
        spaceId: "space-1",
      }),
    );
  });

  it("leaves everything alone when the file dialog is cancelled", async () => {
    mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Uni" })]);
    mockCommand("list_space_modules", ["notes"]);
    mockCommand("plugin:dialog|open", null);
    mockCommand("import_page_json", makeEntity());
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "import page");
    await user.click(await screen.findByText("Import Page from File"));
    await waitFor(() => expect(callsOf("plugin:dialog|open")).toHaveLength(1));
    expect(callsOf("import_page_json")).toHaveLength(0);
  });
});
