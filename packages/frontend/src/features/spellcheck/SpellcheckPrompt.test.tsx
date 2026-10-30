import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { settings } from "#/lib/settings/settings.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SpellcheckPrompt } from "./SpellcheckPrompt";

beforeEach(() => {
  settings.reset("notes.spellcheck");
  settings.reset("notes.spellcheckLanguages");
  act(() => useNavStore.getState().setWhatsNewOpen(false));
});

describe("the question whether to check spelling", () => {
  it("is asked once, in a dialog with a clear choice", async () => {
    renderWithProviders(<SpellcheckPrompt />);
    const dialog = await screen.findByRole("alertdialog", { name: "Check your spelling?" });
    expect(within(dialog).getByRole("button", { name: "Turn on" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("is not asked again once it was answered", () => {
    preferences.set(STORAGE_KEYS.spellcheckAsked, "1");
    renderWithProviders(<SpellcheckPrompt />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("is not asked of someone who already turned the spell checker on", () => {
    settings.set("notes.spellcheck", true);
    renderWithProviders(<SpellcheckPrompt />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("waits while What's new is open", async () => {
    act(() => useNavStore.getState().setWhatsNewOpen(true));
    renderWithProviders(<SpellcheckPrompt />);
    expect(screen.queryByRole("alertdialog", { name: "Check your spelling?" })).toBeNull();
    act(() => useNavStore.getState().setWhatsNewOpen(false));
    expect(await screen.findByRole("alertdialog", { name: "Check your spelling?" })).toBeVisible();
  });

  it("cannot be closed without choosing", async () => {
    const { user } = renderWithProviders(<SpellcheckPrompt />);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(preferences.get(STORAGE_KEYS.spellcheckAsked)).toBeNull();
  });

  it("turns the spell checker on with the languages ticked, and does not ask again", async () => {
    const { user } = renderWithProviders(<SpellcheckPrompt />);
    const dialog = await screen.findByRole("alertdialog");
    // English starts ticked on a computer with no other language.
    expect(within(dialog).getByRole("checkbox", { name: "English (US)" })).toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: "German" }));
    await user.click(within(dialog).getByRole("button", { name: "Turn on" }));
    expect(settings.get("notes.spellcheck")).toBe(true);
    expect(settings.get("notes.spellcheckLanguages")).toEqual(["en", "de"]);
    expect(preferences.get(STORAGE_KEYS.spellcheckAsked)).toBe("1");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("leaves it off on Not now, and does not ask again", async () => {
    const { user } = renderWithProviders(<SpellcheckPrompt />);
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(settings.get("notes.spellcheck")).toBe(false);
    expect(preferences.get(STORAGE_KEYS.spellcheckAsked)).toBe("1");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("will not turn on with no language ticked", async () => {
    const { user } = renderWithProviders(<SpellcheckPrompt />);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "English (US)" }));
    expect(within(dialog).getByRole("button", { name: "Turn on" })).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    renderWithProviders(<SpellcheckPrompt />);
    await screen.findByRole("alertdialog");
    await expectNoA11yViolations();
  });
});
