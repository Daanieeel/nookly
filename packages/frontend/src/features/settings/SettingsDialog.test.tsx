import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { CommandsPalette } from "#/components/commands-palette.tsx";
import { SETTING_CATEGORIES, SETTING_IDS } from "#/lib/settings/registry.ts";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useThemeStore } from "#/lib/theme.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";

function renderOpen() {
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  return rendered;
}

function rowFor(id: string) {
  return document.querySelector(`[data-setting-id="${id}"]`);
}

beforeEach(() => {
  act(() => useNavStore.getState().setSettingsOpen(false));
});

describe("the settings dialog", () => {
  it("stays closed until opened, then focuses the search", async () => {
    renderWithProviders(<SettingsDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => useNavStore.getState().setSettingsOpen(true));
    const search = await screen.findByRole("searchbox", { name: "Search settings" });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    await waitFor(() => expect(search).toHaveFocus());
  });

  it("has no axe violations", async () => {
    renderOpen();
    await screen.findByRole("dialog");
    await expectNoA11yViolations();
  });

  it("lists every category with General first", async () => {
    renderOpen();
    const nav = await screen.findByRole("navigation", { name: "Settings categories" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["General", "Appearance", "Calendar", "Notes", "Backup", "Agent", "Shortcuts"]);
    expect(within(nav).getByRole("button", { name: "General" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("switches category from the navigation", async () => {
    const { user } = renderOpen();
    await screen.findByRole("dialog");
    expect(rowFor("appearance.theme")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Appearance" }));
    expect(rowFor("appearance.theme")).not.toBeNull();
    expect(rowFor("general.timezone")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Appearance" })).toBeInTheDocument();
  });

  it("has a row with a control for every setting", async () => {
    const { user } = renderOpen();
    await screen.findByRole("dialog");
    const found = new Set<string>();
    for (const category of SETTING_CATEGORIES) {
      await user.click(screen.getByRole("button", { name: new RegExp(`^${category}`, "i") }));
      for (const row of document.querySelectorAll("[data-setting-id]")) {
        const id = row.getAttribute("data-setting-id") ?? "";
        found.add(id);
        expect(row.querySelector("button, input, [role=switch], [role=tab]"), id).not.toBeNull();
        expect(row.textContent).toContain(id);
      }
    }
    expect([...found].sort()).toEqual([...SETTING_IDS].sort());
  });

  it("filters rows while typing in the search and counts matches per category", async () => {
    const { user } = renderOpen();
    await user.type(await screen.findByRole("searchbox"), "dark mode");
    expect(rowFor("appearance.theme")).not.toBeNull();
    expect(rowFor("appearance.fileViewerTheme")).not.toBeNull();
    expect(rowFor("general.timezone")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Search results" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 matches")).toBeInTheDocument();
    expect(screen.getAllByLabelText("0 matches")).toHaveLength(6);
  });

  it("finds a setting by a synonym, its id and a typo", async () => {
    const { user } = renderOpen();
    const search = await screen.findByRole("searchbox");
    await user.type(search, "fibonacci");
    expect(rowFor("general.effortScale")).not.toBeNull();
    await user.clear(search);
    await user.type(search, "notes.defaultCodeLanguage");
    expect(rowFor("notes.defaultCodeLanguage")).not.toBeNull();
    await user.clear(search);
    await user.type(search, "timezne");
    expect(rowFor("general.timezone")).not.toBeNull();
  });

  it.each([
    ["monday", "calendar.weekStart"],
    ["scroll", "calendar.dayStartHour"],
    ["grid", "calendar.snapMinutes"],
    ["arrows", "notes.arrowLigatures"],
    ["syntax highlighting", "notes.defaultCodeLanguage"],
    ["appointment length", "calendar.calendarEntryLengthMinutes"],
  ])("finds %j by its synonyms", async (query, id) => {
    const { user } = renderOpen();
    await user.type(await screen.findByRole("searchbox"), query);
    expect(rowFor(id)).not.toBeNull();
  });

  it("finds rows that have no setting, like the version", async () => {
    const { user } = renderOpen();
    await user.type(await screen.findByRole("searchbox"), "updates");
    expect(screen.getByText("Version")).toBeInTheDocument();
  });

  it("explains an empty search and clears it from the button", async () => {
    const { user } = renderOpen();
    const search = await screen.findByRole("searchbox");
    await user.type(search, "zzzqqq");
    expect(screen.getByText("No settings match “zzzqqq”.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(rowFor("general.timezone")).not.toBeNull();
  });

  it("clears the search on the first Escape and closes on the second", async () => {
    const { user } = renderOpen();
    const search = await screen.findByRole("searchbox");
    await user.type(search, "theme");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useNavStore.getState().settingsOpen).toBe(false);
  });

  it("starts with an empty search the next time it opens", async () => {
    const { user } = renderOpen();
    await user.type(await screen.findByRole("searchbox"), "theme");
    act(() => useNavStore.getState().setSettingsOpen(false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    act(() => useNavStore.getState().setSettingsOpen(true));
    expect(await screen.findByRole("searchbox")).toHaveValue("");
  });

  it("offers a reset only for a changed setting, and puts the default back", async () => {
    // jsdom has no matchMedia; a light system.
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { user } = renderOpen();
    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    expect(screen.queryByRole("button", { name: /^Reset/ })).toBeNull();

    act(() => useThemeStore.getState().setTheme("dark"));
    const reset = await screen.findByRole("button", { name: "Reset Theme to default" });
    expect(document.documentElement).toHaveClass("dark");
    await user.hover(reset);
    expect(await screen.findAllByText("Reset to default")).not.toHaveLength(0);

    await user.click(reset);
    expect(settings.get("appearance.theme")).toBe("system");
    expect(useThemeStore.getState().theme).toBe("system");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(screen.queryByRole("button", { name: /^Reset/ })).toBeNull();
  });

  it("resets a setting from the search results too", async () => {
    settings.set("general.effortScale", "fibonacci");
    const { user } = renderOpen();
    await user.type(await screen.findByRole("searchbox"), "effort");
    await user.click(await screen.findByRole("button", { name: "Reset Effort scale to default" }));
    expect(settings.get("general.effortScale")).toBe("tshirt");
  });

  it("saves a number of minutes in steps of five and moves it by ten with the buttons", async () => {
    const { user } = renderOpen();
    await user.click(await screen.findByRole("button", { name: "Calendar" }));
    const input = screen.getByRole("spinbutton", { name: "Session length" });
    await user.clear(input);
    await user.type(input, "4");
    // On its way to 45: rounded into range, shown as typed.
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(5);
    expect(input).toHaveValue(4);
    await user.type(input, "7");
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(45);
    await user.tab();
    expect(input).toHaveValue(45);
    await user.click(screen.getByRole("button", { name: "Increase Session length" }));
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(55);
    await user.click(screen.getByRole("button", { name: "Decrease Session length" }));
    await user.click(screen.getByRole("button", { name: "Decrease Session length" }));
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(35);
  });

  it("saves the calendar layout and editor settings from their controls", async () => {
    const { user } = renderOpen();
    await user.click(await screen.findByRole("button", { name: "Calendar" }));
    await user.click(screen.getByRole("button", { name: "First day of the week" }));
    await user.click(await screen.findByRole("option", { name: "Saturday" }));
    expect(settings.get("calendar.weekStart")).toBe("saturday");

    const hour = screen.getByRole("spinbutton", { name: "Day starts at" });
    await user.clear(hour);
    await user.type(hour, "8");
    expect(settings.get("calendar.dayStartHour")).toBe(8);
    await user.clear(hour);
    await user.type(hour, "24");
    // The 2 was a valid hour on its own; the 24 that followed is held at the last hour.
    expect(settings.get("calendar.dayStartHour")).toBe(23);

    await user.click(screen.getByRole("button", { name: "Snap to" }));
    await user.click(await screen.findByRole("option", { name: "30 minutes" }));
    expect(settings.get("calendar.snapMinutes")).toBe(30);

    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByRole("switch", { name: "Turn arrows into symbols" }));
    expect(settings.get("notes.arrowLigatures")).toBe(false);
  });

  it("opens and closes with Ctrl and a comma", async () => {
    const { user } = renderWithProviders(<SettingsDialog />);
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog");
    await user.keyboard("{Control>},{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes when another overlay opens", async () => {
    renderOpen();
    await screen.findByRole("dialog");
    act(() => useNavStore.getState().setCommandsOpen(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Open Settings in the commands palette", () => {
  it("opens the settings dialog", async () => {
    mockCommand("list_spaces", []);
    const { user } = renderWithProviders(
      <>
        <CommandsPalette />
        <SettingsDialog />
      </>,
    );
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "settings");
    await user.click(await screen.findByText("Open Settings"));
    expect(useNavStore.getState().settingsOpen).toBe(true);
    expect(useNavStore.getState().commandsOpen).toBe(false);
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });
});

describe("opening the settings file", () => {
  it("opens it from the button in the dialog", async () => {
    mockCommand("open_settings_file", null);
    const { user } = renderOpen();
    await user.click(await screen.findByRole("button", { name: "Open settings file" }));
    await waitFor(() => expect(callsOf("open_settings_file")).toHaveLength(1));
  });

  it("says so on the button when the file cannot be opened", async () => {
    mockCommandWith("open_settings_file", () => {
      throw new Error("no app to open it");
    });
    const { user } = renderOpen();
    await user.click(await screen.findByRole("button", { name: "Open settings file" }));
    expect(await screen.findByRole("button", { name: /Couldn't open/ })).toBeInTheDocument();
  });

  it("opens it from the commands palette", async () => {
    mockCommand("list_spaces", []);
    mockCommand("open_settings_file", null);
    const { user } = renderWithProviders(<CommandsPalette />);
    act(() => useNavStore.getState().setCommandsOpen(true));
    await user.type(await screen.findByPlaceholderText("Run a command…"), "settings json");
    await user.click(await screen.findByText("Open Settings File"));
    await waitFor(() => expect(callsOf("open_settings_file")).toHaveLength(1));
  });
});
