import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntityActions } from "#/components/entity-actions.tsx";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { SHARE_FORMATS } from "./share-page.ts";

/// The details sidebar of a page offers sharing and exporting twice: as buttons at the
/// top and again in the more actions menu. These tests keep the two the same, so adding an
/// option to one and forgetting the other fails here.

const note = makeEntity({ id: "note-1", type: "note", title: "Physics" });

function setup() {
  mockCommand("render_page_markdown", "# Physics");
  mockCommand("render_page_json", '{"format":"nookly-page"}');
  return renderWithProviders(
    <EntityActions
      entity={note}
      exportable
      pin={{ status: "idle", toggle: async () => {} }}
      onTrash={() => {}}
    />,
  );
}

const names = (items: HTMLElement[]) => items.map((i) => i.textContent?.trim() ?? "");

describe("Share options", () => {
  it("are the same in the share popover and the more actions submenu", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Share Page" }));
    const popover = await screen.findByRole("dialog", { name: "Share Page" });
    const inPopover = within(popover)
      .getAllByRole("button")
      .map((b) => b.querySelector("span > span")?.textContent?.trim() ?? "");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Share" }));
    const submenu = (await screen.findByRole("menuitem", { name: "Markdown" })).closest(
      "[role=menu]",
    );
    if (!(submenu instanceof HTMLElement)) throw new Error("the Share submenu did not open");
    const inSubmenu = names(within(submenu).getAllByRole("menuitem"));

    const expected = Object.values(SHARE_FORMATS).map((f) => f.label);
    expect(inPopover).toEqual(expected);
    expect(inSubmenu).toEqual(expected);
  });
});

describe("Export options", () => {
  it("are the same in the export menu and the more actions menu", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Export" }));
    const exportMenu = await screen.findByRole("menu");
    const inExportMenu = names(within(exportMenu).getAllByRole("menuitem"));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const moreMenu = await screen.findByRole("menu");
    const inMoreMenu = names(within(moreMenu).getAllByRole("menuitem")).filter((name) =>
      inExportMenu.includes(name),
    );

    expect(inExportMenu.length).toBeGreaterThan(1);
    expect(inMoreMenu).toEqual(inExportMenu);
  });
});
