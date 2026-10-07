import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { HOTKEYS } from "#/lib/hotkeys.ts";
import { settings } from "#/lib/settings/settings.ts";
import {
  FIXED_SHORTCUTS,
  SHORTCUT_META,
  SHORTCUT_NAMES,
  shortcutSettingId,
} from "#/lib/shortcuts.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cancelPendingShortcut, resetAllShortcuts } from "./shortcut-editing.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";

function rowFor(id: string) {
  const row = document.querySelector<HTMLElement>(`[data-setting-id="${id}"]`);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

async function openShortcuts() {
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "Shortcuts" }));
  return rendered;
}

function recorder(name: keyof typeof HOTKEYS) {
  const title = SHORTCUT_META[name].title.replace(/[()]/g, "\\$&");
  return within(rowFor(shortcutSettingId(name))).getByRole("button", {
    name: new RegExp(`^(Change ${title} shortcut|Press a shortcut)`),
  });
}

beforeEach(() => {
  act(() => useNavStore.getState().setSettingsOpen(false));
});

afterEach(() => {
  act(() => {
    cancelPendingShortcut();
    resetAllShortcuts();
  });
  vi.restoreAllMocks();
});

describe("the shortcuts tab", () => {
  it("lists every registered shortcut with its title, id and current key", async () => {
    await openShortcuts();
    for (const name of SHORTCUT_NAMES) {
      const row = rowFor(shortcutSettingId(name));
      expect(row.textContent, name).toContain(SHORTCUT_META[name].title);
      expect(row.textContent, name).toContain(shortcutSettingId(name));
      expect(recorder(name), name).toBeInTheDocument();
    }
  });

  it("groups them under section headings and lists the fixed shortcuts last", async () => {
    await openShortcuts();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Navigation",
      "Tabs",
      "Create",
      "Calendar",
      "Tasks",
      "Study",
      "Fixed shortcuts",
    ]);
    const fixed = screen.getByRole("region", { name: "Fixed shortcuts" });
    for (const shortcut of FIXED_SHORTCUTS) {
      expect(within(fixed).getByText(shortcut.label)).toBeInTheDocument();
    }
  });

  it("shows the current key, in the platform's words", async () => {
    await openShortcuts();
    expect(within(rowFor("shortcuts.commands")).getByText("Shift")).toBeInTheDocument();
    expect(within(rowFor("shortcuts.today")).getByText("T")).toBeInTheDocument();
  });

  it("shows Not set for an unassigned shortcut, which can still be recorded", async () => {
    settings.set("shortcuts.search", null);
    const { user } = await openShortcuts();
    expect(within(rowFor("shortcuts.search")).getByText("Not set")).toBeInTheDocument();
    await user.click(recorder("search"));
    await user.keyboard("{Control>}{Alt>}k{/Alt}{/Control}");
    expect(settings.get("shortcuts.search")).toBe("Mod+Alt+K");
  });

  it("has no axe violations", async () => {
    await openShortcuts();
    await expectNoA11yViolations();
  });
});

describe("recording a shortcut", () => {
  it("saves the pressed combination as Mod and shows it", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("newTab"));
    expect(recorder("newTab")).toHaveTextContent("Press a shortcut");
    await user.keyboard("{Control>}{Shift>}y{/Shift}{/Control}");
    expect(settings.get("shortcuts.newTab")).toBe("Mod+Shift+Y");
    expect(within(rowFor("shortcuts.newTab")).getByText("Y")).toBeInTheDocument();
    expect(screen.queryByText("Press a shortcut")).toBeNull();
  });

  it("keeps listening through a bare modifier", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("newTab"));
    await user.keyboard("{Control}");
    expect(recorder("newTab")).toHaveTextContent("Press a shortcut");
    expect(settings.get("shortcuts.newTab")).toBe(HOTKEYS.newTab);
  });

  it("cancels on Escape without closing the dialog or changing anything", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("newTab"));
    await user.keyboard("{Escape}");
    expect(settings.get("shortcuts.newTab")).toBe(HOTKEYS.newTab);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(recorder("newTab")).toHaveTextContent("T");
  });

  it("does not fire the app's own shortcuts while recording", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("newTab"));
    // Ctrl+, is Settings' own key: if it reached the app it would close this dialog, and
    // instead it is recorded, found to be taken, and asked about.
    await user.keyboard("{Control>},{/Control}");
    expect(useNavStore.getState().settingsOpen).toBe(true);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Reassign Ctrl+, to New tab?");
    expect(settings.get("shortcuts.newTab")).toBe("Mod+T");
  });

  it("stores nothing when the default is recorded again", async () => {
    settings.set("shortcuts.newTab", "Mod+Shift+Y");
    const { user } = await openShortcuts();
    await user.click(recorder("newTab"));
    await user.keyboard("{Control>}t{/Control}");
    expect(settings.get("shortcuts.newTab")).toBe("Mod+T");
    expect(within(rowFor("shortcuts.newTab")).queryByRole("button", { name: /^Reset/ })).toBeNull();
  });

  it("refuses a bare key for a shortcut that needs a modifier", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("search"));
    await user.keyboard("k");
    expect(await screen.findByRole("alert")).toHaveTextContent("Hold Cmd, Ctrl or Alt");
    expect(settings.get("shortcuts.search")).toBe("Mod+K");
  });

  it("accepts a bare key for a shortcut that is a bare key today", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("today"));
    await user.keyboard("g");
    expect(settings.get("shortcuts.today")).toBe("G");
  });

  it("refuses a key a fixed shortcut owns, with a message instead of a dialog", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("search"));
    await user.keyboard("{Control>}c{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Ctrl+C is used for "Copy", which can\'t be reassigned.',
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(settings.get("shortcuts.search")).toBe("Mod+K");
  });

  it("lets the same key serve shortcuts on different screens without asking", async () => {
    const { user } = await openShortcuts();
    await user.click(recorder("today"));
    await user.keyboard("j");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(settings.get("shortcuts.today")).toBe("J");
    expect(settings.get("shortcuts.nextTask")).toBe("J");
  });
});

describe("a key that is already used", () => {
  async function recordSearchKeyOnQuickJot() {
    const rendered = await openShortcuts();
    await rendered.user.click(recorder("quickJot"));
    await rendered.user.keyboard("{Control>}k{/Control}");
    return rendered;
  }

  it("asks first, naming both shortcuts and the key, and saves nothing yet", async () => {
    await recordSearchKeyOnQuickJot();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reassign Ctrl+K to Quick jot?");
    expect(dialog).toHaveTextContent("Search");
    expect(dialog).toHaveTextContent("has no shortcut");
    expect(within(dialog).getByRole("button", { name: "Reassign" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(settings.get("shortcuts.quickJot")).toBe("Mod+J");
    expect(settings.get("shortcuts.search")).toBe("Mod+K");
  });

  it("has no axe violations", async () => {
    await recordSearchKeyOnQuickJot();
    await screen.findByRole("alertdialog");
    await expectNoA11yViolations();
  });

  it("keeps both shortcuts untouched on Cancel", async () => {
    const { user } = await recordSearchKeyOnQuickJot();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(settings.get("shortcuts.quickJot")).toBe("Mod+J");
    expect(settings.get("shortcuts.search")).toBe("Mod+K");
  });

  it("moves the key on Reassign and unassigns the other, in one write sequence", async () => {
    const apply = vi.spyOn(settings, "apply");
    const { user } = await recordSearchKeyOnQuickJot();
    await user.click(await screen.findByRole("button", { name: "Reassign" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(settings.get("shortcuts.quickJot")).toBe("Mod+K");
    expect(settings.get("shortcuts.search")).toBeNull();
    expect(apply).toHaveBeenCalledTimes(1);
    // The other is unassigned before the new one is set: a failure in between can leave
    // a shortcut without a key, never two on one key.
    expect(apply.mock.calls[0][0]).toEqual([
      { id: "shortcuts.search", value: null },
      { id: "shortcuts.quickJot", value: "Mod+K" },
    ]);
    expect(within(rowFor("shortcuts.search")).getByText("Not set")).toBeInTheDocument();
  });

  it("asks before a reset takes back a default another shortcut now has", async () => {
    settings.apply([
      { id: "shortcuts.search", value: null },
      { id: "shortcuts.quickJot", value: "Mod+K" },
    ]);
    const { user } = await openShortcuts();
    await user.click(
      within(rowFor("shortcuts.search")).getByRole("button", {
        name: "Reset Search to default",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reassign Ctrl+K to Search?");
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));
    expect(settings.get("shortcuts.search")).toBe("Mod+K");
    expect(settings.get("shortcuts.quickJot")).toBeNull();
  });

  it("resets a shortcut straight away when its default is free", async () => {
    settings.set("shortcuts.newTab", "Mod+Shift+Y");
    const { user } = await openShortcuts();
    await user.click(
      within(rowFor("shortcuts.newTab")).getByRole("button", { name: "Reset New tab to default" }),
    );
    expect(settings.get("shortcuts.newTab")).toBe("Mod+T");
  });
});

describe("reset all shortcuts", () => {
  it("is off while nothing has changed", async () => {
    await openShortcuts();
    expect(screen.getByRole("button", { name: "Reset all shortcuts" })).toBeDisabled();
  });

  it("names what is replaced and puts every default back on confirm", async () => {
    settings.set("shortcuts.newTab", "Mod+Shift+Y");
    settings.set("shortcuts.search", null);
    const { user } = await openShortcuts();
    await user.click(screen.getByRole("button", { name: "Reset all shortcuts" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reset all shortcuts?");
    expect(dialog).toHaveTextContent("2");
    expect(dialog).toHaveTextContent("Shortcuts changed");
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole("button", { name: "Reset all shortcuts" }));
    expect(settings.get("shortcuts.newTab")).toBe("Mod+T");
    expect(settings.get("shortcuts.search")).toBe("Mod+K");
  });

  it("changes nothing on Cancel", async () => {
    settings.set("shortcuts.newTab", "Mod+Shift+Y");
    const { user } = await openShortcuts();
    await user.click(screen.getByRole("button", { name: "Reset all shortcuts" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(settings.get("shortcuts.newTab")).toBe("Mod+Shift+Y");
  });
});

describe("searching shortcuts", () => {
  async function search(query: string) {
    const rendered = renderWithProviders(<SettingsDialog />);
    act(() => useNavStore.getState().setSettingsOpen(true));
    await rendered.user.type(await screen.findByRole("searchbox"), query);
    return screen
      .getAllByRole("group")
      .map((g) => g.getAttribute("data-setting-id"))
      .filter(Boolean);
  }

  it("finds one by title", async () => {
    expect((await search("quick jot"))[0]).toBe("shortcuts.quickJot");
  });

  it("finds one by a synonym", async () => {
    expect(await search("flashcards")).toContain("shortcuts.study");
  });

  it("finds one by its key, first", async () => {
    expect((await search("cmd k"))[0]).toBe("shortcuts.search");
  });

  it("finds one by a key with several modifiers", async () => {
    expect((await search("ctrl shift p"))[0]).toBe("shortcuts.commands");
  });

  it("follows a rebinding", async () => {
    settings.set("shortcuts.newTab", "Mod+Shift+Y");
    expect((await search("cmd shift y"))[0]).toBe("shortcuts.newTab");
  });
});
