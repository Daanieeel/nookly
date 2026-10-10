import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { PageExportMenu } from "./PageExportMenu.tsx";

const note = makeEntity({ id: "note-1", type: "note", title: "Physics: week 3" });

async function openMenu() {
  mockCommand("render_page_markdown", "# Physics");
  const view = renderWithProviders(<PageExportMenu entity={note} />);
  await view.user.click(screen.getByRole("button", { name: "Export" }));
  return view;
}

describe("PageExportMenu Nookly page file", () => {
  it("saves the page as a Nookly page file at the chosen path", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Physics week 3.nookly.json");
    mockCommand("export_page_json", null);
    const { user } = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Export as Nookly Page/ }));
    await waitFor(() => expect(callsOf("export_page_json")).toHaveLength(1));
    expect(callsOf("export_page_json")[0]).toEqual({
      entityId: "note-1",
      path: "/tmp/Physics week 3.nookly.json",
    });
    // The suggested name drops characters a file name cannot hold.
    expect(callsOf("plugin:dialog|save")[0]).toMatchObject({
      options: { defaultPath: "Physics week 3.nookly.json" },
    });
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    mockCommand("plugin:dialog|save", null);
    mockCommand("export_page_json", null);
    const { user } = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Export as Nookly Page/ }));
    await waitFor(() => expect(callsOf("plugin:dialog|save")).toHaveLength(1));
    expect(callsOf("export_page_json")).toHaveLength(0);
  });
});
