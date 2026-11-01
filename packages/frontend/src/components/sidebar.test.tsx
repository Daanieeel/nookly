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

  it("ignores a vertical scroll", async () => {
    setup();
    fireEvent.wheel(await slot("Uni"), { deltaX: 2, deltaY: 120 });
    expect(pane("space-2")).toBeNull();
    expect(useNavStore.getState().activeSpaceId).toBeNull();
  });
});

/// The pane of a Space while it is on screen, and where it was moved to.
const pane = (id: string) => document.querySelector<HTMLElement>(`[data-space-pane="${id}"]`);
const shift = (id: string) => {
  const match = pane(id)?.style.transform.match(/translate3d\((-?[\d.]+)px/);
  return match ? Number(match[1]) : 0;
};
const swipe = async (deltaX: number) => fireEvent.wheel(await slot("Uni"), { deltaX, deltaY: 0 });
const settled = { timeout: 3000 };

describe("swiping between Spaces", () => {
  it("moves the list with the fingers, the next Space coming in beside it", async () => {
    setup();
    await swipe(60);
    expect(shift("space-1")).toBe(-60);
    // One pane width away from its own place: 240 wide, 60 in.
    expect(shift("space-2")).toBe(180);
  });

  it("brings in the previous Space for a swipe the other way", async () => {
    useNavStore.setState({ activeSpaceId: "space-2" });
    setup();
    await vi.waitFor(() => expect(pane("space-2")).not.toBeNull());
    fireEvent.wheel(await slot("Work"), { deltaX: -60, deltaY: 0 });
    expect(shift("space-2")).toBe(60);
    expect(shift("space-1")).toBe(-180);
  });

  it("goes on to the next Space after a swipe, which can be any Space of the stored order", async () => {
    setup();
    await swipe(100);
    await vi.waitFor(() => expect(useNavStore.getState().activeSpaceId).toBe("space-2"), settled);
    // Only the Space that is shown stays, at rest, with nothing left to move.
    await vi.waitFor(() => expect(pane("space-1")).toBeNull(), settled);
    expect(pane("space-2")?.style.transform).toBe("");
  });

  it("comes back to the same Space when the fingers were let go before halfway, and had stopped", async () => {
    // The clock runs on, but can be set ahead, as when the fingers waited before moving again.
    const realNow = performance.now.bind(performance);
    let ahead = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => realNow() + ahead);
    setup();
    await swipe(50);
    // Long after the drag, a last tiny movement: the list was not going anywhere any more.
    ahead = 500;
    await swipe(1);
    await vi.waitFor(() => expect(pane("space-2")).toBeNull(), settled);
    expect(useNavStore.getState().activeSpaceId).toBeNull();
    expect(pane("space-1")?.style.transform).toBe("");
    now.mockRestore();
  });

  it("registers the new Space the moment the fingers lift, not when the trackpad stops gliding", async () => {
    setup();
    const target = await slot("Uni");
    // Fingers still moving, then lifting: the wheel goes on with a fading glide.
    for (const dx of [40, 40, 30, 22, 16, 11]) fireEvent.wheel(target, { deltaX: dx, deltaY: 0 });
    // The bottom row already shows it, without waiting for the glide to end or the list to arrive.
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    expect(await slot("Work")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not take the rest of the glide for a new swipe", async () => {
    setup();
    const target = await slot("Uni");
    for (const dx of [40, 40, 30, 22, 16, 11, 8, 6, 4, 3, 2]) {
      fireEvent.wheel(target, { deltaX: dx, deltaY: 0 });
    }
    await vi.waitFor(() => expect(pane("space-1")).toBeNull(), settled);
    // It stopped on Work, and was not carried on to Home by what was left of the glide.
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    expect(pane("space-2")?.style.transform).toBe("");
  });

  it("moves one Space for one swipe, however long the fingers keep going and the glide lasts", async () => {
    setup();
    const target = await slot("Uni");
    // Far more than a pane's width, a glide that fades, with no pause in between.
    for (const dx of [60, 60, 60, 60, 60, 60, 50, 40, 30, 22, 16, 11, 8, 6, 4, 3, 2, 2, 1]) {
      fireEvent.wheel(target, { deltaX: dx, deltaY: 0 });
    }
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    await vi.waitFor(
      () => expect(document.querySelectorAll("[data-space-pane]")).toHaveLength(1),
      settled,
    );
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
  });

  it("does not take an uneven glide for a second swipe", async () => {
    setup();
    const target = await slot("Uni");
    // The glide after the flick wobbles, growing for a moment, but never stops for a pause.
    for (const dx of [60, 60, 50, 44, 38, 32, 28, 30, 33, 36, 40, 34, 30, 26, 22, 18, 14]) {
      fireEvent.wheel(target, { deltaX: dx, deltaY: 0 });
    }
    await vi.waitFor(
      () => expect(document.querySelectorAll("[data-space-pane]")).toHaveLength(1),
      settled,
    );
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
  });

  it("takes a second swipe after the fingers lifted for a moment, without waiting for the slide", async () => {
    // The clock can be moved on by hand: a short pause is all that tells two swipes apart.
    const realNow = performance.now.bind(performance);
    let ahead = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => realNow() + ahead);
    setup();
    const target = await slot("Uni");
    const fire = (sizes: number[]) => {
      for (const dx of sizes) {
        ahead += 8;
        fireEvent.wheel(target, { deltaX: dx, deltaY: 0 });
      }
    };
    // A flick that glides, then the fingers touch down again after a short pause, and speed up from small.
    fire([40, 40, 30, 22, 16, 11, 8, 6]);
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    ahead += 70;
    fire([3, 6, 10, 15, 22, 30, 40, 40, 30, 22, 16, 11]);
    // It went on from Work to Home, from where the first one was still sliding in.
    expect(useNavStore.getState().activeSpaceId).toBe("space-3");
    await vi.waitFor(
      () => expect(document.querySelectorAll("[data-space-pane]")).toHaveLength(1),
      settled,
    );
    expect(pane("space-3")?.style.transform).toBe("");
    now.mockRestore();
  });

  it("still switches by click or key while a swipe is going on", async () => {
    const { user } = setup();
    await swipe(60);
    expect(pane("space-2")).not.toBeNull();
    await user.click(await slot("Home"));
    expect(useNavStore.getState().activeSpaceId).toBe("space-3");
    await vi.waitFor(() => expect(pane("space-1")).toBeNull(), settled);
    await vi.waitFor(() => expect(pane("space-2")).toBeNull(), settled);
    expect(pane("space-3")?.style.transform).toBe("");
  });

  it("a swipe that goes back puts the bottom row back too", async () => {
    setup();
    // Lets go past halfway, so the bottom row switches at once.
    for (const dx of [40, 40, 30, 22, 16, 11]) {
      fireEvent.wheel(await slot("Uni"), { deltaX: dx, deltaY: 0 });
    }
    expect(useNavStore.getState().activeSpaceId).toBe("space-2");
    // Then takes hold of the list and drags it back to where it was, slowly, and lets go.
    const realNow = performance.now.bind(performance);
    let ahead = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => realNow() + ahead);
    ahead = 1000;
    for (const dx of [-8, -8, -8]) {
      ahead += 40;
      fireEvent.wheel(await slot("Work"), { deltaX: dx, deltaY: 0 });
    }
    await vi.waitFor(() => expect(useNavStore.getState().activeSpaceId).toBe("space-1"), settled);
    await vi.waitFor(() => expect(pane("space-2")).toBeNull(), settled);
    expect(pane("space-1")?.style.transform).toBe("");
    now.mockRestore();
  });

  it("does not move at all past the last Space, nor past the first", async () => {
    useNavStore.setState({ activeSpaceId: "space-6" });
    const { unmount } = setup();
    await vi.waitFor(() => expect(pane("space-6")).not.toBeNull());
    // A swipe towards nothing: no movement, no empty space opening up, no other pane.
    fireEvent.wheel(await slot("Travel"), { deltaX: 100, deltaY: 0 });
    expect(pane("space-6")?.style.transform).toBe("");
    expect(document.querySelectorAll("[data-space-pane]")).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(useNavStore.getState().activeSpaceId).toBe("space-6");
    unmount();

    useNavStore.setState({ activeSpaceId: "space-1" });
    setup();
    await vi.waitFor(() => expect(pane("space-1")).not.toBeNull());
    fireEvent.wheel(await slot("Uni"), { deltaX: -100, deltaY: 0 });
    expect(pane("space-1")?.style.transform).toBe("");
    expect(document.querySelectorAll("[data-space-pane]")).toHaveLength(1);
  });

  it("does not bank what was swiped into the end: turning around moves at once", async () => {
    useNavStore.setState({ activeSpaceId: "space-6" });
    setup();
    await vi.waitFor(() => expect(pane("space-6")).not.toBeNull());
    const target = await slot("Travel");
    fireEvent.wheel(target, { deltaX: 100, deltaY: 0 });
    expect(pane("space-6")?.style.transform).toBe("");
    // Swiping the other way brings the previous Space in, from the end, not from 100px further.
    fireEvent.wheel(target, { deltaX: -50, deltaY: 0 });
    expect(shift("space-6")).toBe(50);
    expect(pane("space-5")).not.toBeNull();
  });

  it("slides to a Space picked another way, from the side it is on", async () => {
    const { user } = setup();
    await user.click(await slot("Work"));
    // Work enters from the right while Uni leaves to the left, and both are gone from the way after.
    await vi.waitFor(() => expect(pane("space-1")).not.toBeNull());
    expect(shift("space-2")).toBeGreaterThan(0);
    await vi.waitFor(() => expect(pane("space-1")).toBeNull(), settled);
    expect(pane("space-2")?.style.transform).toBe("");
  });

  it("can be taken hold of while it is still settling, and then settles on the nearer Space", async () => {
    const { user } = setup();
    await user.click(await slot("Work"));
    await vi.waitFor(() => expect(pane("space-1")).not.toBeNull());
    // Work has hardly started to come in, so letting go of it sends the list back to Uni.
    fireEvent.wheel(await slot("Work"), { deltaX: 0.5, deltaY: 0 });
    await vi.waitFor(() => expect(useNavStore.getState().activeSpaceId).toBe("space-1"), settled);
    await vi.waitFor(() => expect(pane("space-2")).toBeNull(), settled);
    expect(pane("space-1")?.style.transform).toBe("");
  });
});

describe("the swipe hint", () => {
  const hint = () => screen.queryByText(/Swipe to switch Spaces/);

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
    await vi.waitFor(() => expect(useNavStore.getState().activeSpaceId).toBe("space-2"), settled);
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
