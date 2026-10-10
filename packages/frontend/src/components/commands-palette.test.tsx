import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { CommandsPalette } from "./commands-palette.tsx";

describe("Import from File in the commands palette", () => {
  beforeEach(() => {
    useNavStore.setState({ importOpen: false });
  });

  it("opens the import dialog, and the palette closes", async () => {
    mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Uni" })]);
    mockCommand("list_space_modules", ["notes"]);
    act(() => useNavStore.getState().setActiveSpace("space-1"));
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "import page");
    await user.click(await screen.findByText("Import from File"));
    expect(useNavStore.getState().importOpen).toBe(true);
    expect(useNavStore.getState().commandsOpen).toBe(false);
  });
});
