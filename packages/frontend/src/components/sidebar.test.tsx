import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import { SidebarProvider } from "@nookly/ui/components/sidebar";
import "#/components/sidebar/context-actions.tsx";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useSwipeHint } from "#/lib/swipe-hint.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { AppSidebar } from "./sidebar.tsx";

const names = ["Uni", "Work", "Home", "Gym", "Music", "Travel"];
const spaces = names.map((name, i) =>
  makeSpace({ id: `space-${i + 1}`, name, position: i, icon: null }),
);

// jsdom has no matchMedia, which the sidebar uses to tell a phone from a desktop.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  mockCommand("list_space_modules", ["notes", "tasks"]);
  mockCommand("get_cli_install_status", { installed: true, onPath: true });
  mockCommand("list_assignments_all_spaces", []);
  mockCommand("list_tasks_all_spaces", []);
  mockCommand("list_entities", []);
  useNavStore.setState({ view: { kind: "dashboard" }, activeSpaceId: null });
  preferences.remove(STORAGE_KEYS.swipeHintDone);
  useSwipeHint.setState({ done: false });
});

function setup(list = spaces) {
  mockCommand("list_spaces", list);
  return renderWithProviders(
    <SidebarProvider>
      <AppSidebar />
      <ContextMenuHost />
    </SidebarProvider>,
  );
}

const slot = (name: string) => screen.findByRole("button", { name });

describe("one Space at a time", () => {
  it("lists only the modules of the active Space, flat, under its name", async () => {
    mockCommandWith("list_space_modules", (args) =>
      // SAFETY: `list_space_modules` is only ever invoked with `{ spaceId }`.
      (args as { spaceId: string }).spaceId === "space-2" ? ["decks"] : ["notes", "tasks"],
    );
    useNavStore.setState({ activeSpaceId: "space-2" });
    setup();
    expect(await screen.findByRole("button", { name: "Decks" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    // Its name heads the list; the others are only icons in the bottom row.
    expect(screen.getAllByText("Work").length).toBeGreaterThan(0);
  });

  it("falls back to the first Space when none is stored or the stored one is gone", async () => {
    useNavStore.setState({ activeSpaceId: "deleted" });
    setup();
    expect(await slot("Uni")).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to a Space by its icon in the bottom row, without leaving the page", async () => {
    const { user } = setup();
    await user.click(await slot("Work"));
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    expect(useNavStore.getState().view).toEqual({ kind: "dashboard" });
    expect(await slot("Work")).toHaveAttribute("aria-pressed", "true");
  });

  it("follows the page, so opening something in another Space switches to it", async () => {
    setup();
    await slot("Uni");
    act(() =>
      useNavStore.getState().setView({ kind: "module", spaceId: "space-3", module: "notes" }),
    );
    expect(await slot("Home")).toHaveAttribute("aria-pressed", "true");
  });

  it("asks to create a first Space when there is none", async () => {
    setup([]);
    expect(await screen.findByText(/to create your first Space/)).toBeInTheDocument();
  });
});

describe("the row of Spaces", () => {
  it("shows every Space with four or fewer", async () => {
    setup(spaces.slice(0, 4));
    for (const name of names.slice(0, 4)) expect(await slot(name)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More Spaces" })).toBeNull();
  });

  it("shows three and a three dot button past four, listing the rest", async () => {
    const { user } = setup();
    for (const name of names.slice(0, 3)) expect(await slot(name)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gym" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More Spaces" }));
    const list = await screen.findByRole("dialog", { name: "More Spaces" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Gym", "Music", "Travel"]);
  });

  it("switches to a Space of the list, which then takes the last visible slot", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "More Spaces" }));
    await user.click(await screen.findByRole("button", { name: "Music" }));
    expect(useNavStore.getState().activeSpaceId).toBe("space-5");
    // The list closed, and Music displaced Home from the row without reordering anything.
    expect(await slot("Music")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More Spaces" }));
    const list = await screen.findByRole("dialog", { name: "More Spaces" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Home", "Gym", "Travel"]);
    expect(callsOf("reorder_spaces")).toEqual([]);
  });

  it("restores the original row when a visible Space is active again", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "More Spaces" }));
    await user.click(await screen.findByRole("button", { name: "Music" }));
    await user.click(await slot("Uni"));
    expect(await slot("Home")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Music" })).toBeNull();
  });
});

describe("switching with the keyboard and a swipe", () => {
  it("goes to the next and previous Space with Mod+Alt+Down and Mod+Alt+Up", async () => {
    const { user } = setup();
    await slot("Uni");
    await user.keyboard("{Control>}{Alt>}{ArrowDown}{/Alt}{/Control}");
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    await user.keyboard("{Control>}{Alt>}{ArrowUp}{/Alt}{/Control}");
    expect(useNavStore.getState().activeSpaceId).toBe("space-1");
  });

  it("cycles through hidden Spaces too, with a swipe sideways on the sidebar", async () => {
    setup();
    fireEvent.wheel(await slot("Uni"), { deltaX: 100, deltaY: 0 });
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
  });

  it("ignores a vertical scroll", async () => {
    setup();
    fireEvent.wheel(await slot("Uni"), { deltaX: 2, deltaY: 120 });
    expect(useNavStore.getState().activeSpaceId).toBeNull();
  });
});

describe("the swipe hint", () => {
  const hint = () => screen.queryByText(/Swipe sideways with two fingers/);

  it("teases the swipe at the bottom while there is more than one Space", async () => {
    setup();
    await slot("Uni");
    expect(hint()).toBeInTheDocument();
  });

  it("stays away with a single Space, where there is nothing to swipe to", async () => {
    setup(spaces.slice(0, 1));
    await slot("Uni");
    expect(hint()).toBeNull();
  });

  it("goes for good once the swipe was used", async () => {
    setup();
    fireEvent.wheel(await slot("Uni"), { deltaX: 100, deltaY: 0 });
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    expect(hint()).toBeNull();
    expect(preferences.get(STORAGE_KEYS.swipeHintDone)).toBe("1");
  });

  it("stays on after a sideways scroll too short to count, and after other ways of switching", async () => {
    const { user } = setup();
    fireEvent.wheel(await slot("Uni"), { deltaX: 20, deltaY: 0 });
    await user.click(await slot("Work"));
    await user.keyboard("{Control>}{Alt>}{ArrowDown}{/Alt}{/Control}");
    expect(hint()).toBeInTheDocument();
    expect(preferences.get(STORAGE_KEYS.swipeHintDone)).toBeNull();
  });

  it("stays gone on the next launch", async () => {
    preferences.set(STORAGE_KEYS.swipeHintDone, "1");
    useSwipeHint.setState({ done: true });
    setup();
    await slot("Uni");
    expect(hint()).toBeNull();
  });

  it("has no accessibility violations", async () => {
    setup();
    await slot("Uni");
    await expectNoA11yViolations();
  });
});

describe("the + button", () => {
  it("offers New Space and Add Module", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    expect(await screen.findByRole("button", { name: "New Space" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Module" })).toBeInTheDocument();
  });

  it("opens the New Space dialog", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "New Space" }));
    expect(await screen.findByRole("dialog", { name: "New Space" })).toBeInTheDocument();
  });

  it("adds a module to the active Space", async () => {
    mockCommand("add_space_module", null);
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("button", { name: "Add Module" }));
    await user.click(await screen.findByText("Decks"));
    await vi.waitFor(() =>
      expect(callsOf("add_space_module")).toContainEqual({
        spaceId: "space-1",
        moduleKey: "decks",
      }),
    );
    expect(useNavStore.getState().view).toEqual({
      kind: "module",
      spaceId: "space-1",
      module: "decks",
    });
  });
});

describe("the menu of a Space icon", () => {
  async function openMenu(name = "Work") {
    fireEvent.contextMenu(await slot(name));
    return screen.findByRole("menu");
  }

  it("lists Rename, Change Icon, Change Color and Delete Space", async () => {
    setup();
    const menu = await openMenu();
    for (const label of ["Rename", "Change Icon", "Change Color", "Delete Space"]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
  });

  it("opens the settings of that Space to rename it", async () => {
    const { user } = setup();
    const menu = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));
    expect(await screen.findByRole("dialog", { name: "Space settings" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Work")).toBeInTheDocument();
  });

  it("asks before deleting, and deletes nothing by itself", async () => {
    mockCommand("delete_space", null);
    const { user } = setup();
    const menu = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Delete Space" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(callsOf("delete_space")).toEqual([]);
  });

  it("has no accessibility violations while open", async () => {
    setup();
    await openMenu();
    await expectNoA11yViolations();
  });
});

describe("accessibility", () => {
  it("has no violations with the list of more Spaces open", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "More Spaces" }));
    await screen.findByRole("dialog", { name: "More Spaces" });
    await expectNoA11yViolations();
  });

  it("has no violations with the + menu open", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await screen.findByRole("button", { name: "New Space" });
    await expectNoA11yViolations();
  });
});
