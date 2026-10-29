import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import {
  DictionaryFileButton,
  LanguageChecklist,
  SpellLanguagesControl,
} from "./SpellcheckControls";

beforeEach(() => {
  settings.reset("notes.spellcheckLanguages");
});

describe("LanguageChecklist", () => {
  it("lists every language with a checkbox, ticked for the ones chosen", () => {
    renderWithProviders(<LanguageChecklist value={["en", "de"]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "English (US)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "German" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "French" })).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
  });

  it("adds and takes out a language, keeping the others in their order", async () => {
    const seen: string[][] = [];
    const { user } = renderWithProviders(
      <LanguageChecklist value={["en"]} onChange={(next) => seen.push(next)} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "German" }));
    await user.click(screen.getByRole("checkbox", { name: "English (US)" }));
    expect(seen).toEqual([["en", "de"], []]);
  });

  it("has no accessibility violations", async () => {
    renderWithProviders(<LanguageChecklist value={["en"]} onChange={() => {}} />);
    await expectNoA11yViolations();
  });
});

describe("SpellLanguagesControl", () => {
  it("saves the languages as they are ticked", async () => {
    const { user } = renderWithProviders(<SpellLanguagesControl />);
    await user.click(screen.getByRole("checkbox", { name: "German" }));
    expect(settings.get("notes.spellcheckLanguages")).toEqual(["en", "de"]);
    await user.click(screen.getByRole("checkbox", { name: "English (US)" }));
    expect(settings.get("notes.spellcheckLanguages")).toEqual(["de"]);
  });
});

describe("DictionaryFileButton", () => {
  it("opens the dictionary file", async () => {
    mockCommand("open_dictionary_file", null);
    const { user } = renderWithProviders(<DictionaryFileButton />);
    await user.click(screen.getByRole("button", { name: "Show dictionary file" }));
    await waitFor(() => expect(callsOf("open_dictionary_file")).toHaveLength(1));
  });

  it("says when the file could not be opened", async () => {
    mockCommandWith("open_dictionary_file", () => {
      throw new Error("nope");
    });
    const { user } = renderWithProviders(<DictionaryFileButton />);
    await user.click(screen.getByRole("button", { name: "Show dictionary file" }));
    expect((await screen.findAllByText("Couldn't open, try again")).length).toBeGreaterThan(0);
  });

  it("has no accessibility violations", async () => {
    renderWithProviders(<DictionaryFileButton />);
    await expectNoA11yViolations();
  });
});
