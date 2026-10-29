import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { LanguageChecklist, SpellLanguagesControl, SpellWordsControl } from "./SpellcheckControls";

beforeEach(() => {
  settings.reset("notes.spellcheckLanguages");
  settings.reset("notes.spellcheckWords");
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

describe("SpellWordsControl", () => {
  it("says so when there are no words yet", () => {
    renderWithProviders(<SpellWordsControl />);
    expect(screen.getByText("No words added yet.")).toBeInTheDocument();
  });

  it("lists the words and takes one out", async () => {
    settings.set("notes.spellcheckWords", ["Nookly", "Informatik"]);
    const { user } = renderWithProviders(<SpellWordsControl />);
    const list = screen.getByRole("list", { name: "Words you added" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((i) => i.textContent),
    ).toEqual(["Nookly", "Informatik"]);
    await user.click(screen.getByRole("button", { name: "Remove Nookly" }));
    expect(settings.get("notes.spellcheckWords")).toEqual(["Informatik"]);
  });

  it("has no accessibility violations", async () => {
    settings.set("notes.spellcheckWords", ["Nookly"]);
    renderWithProviders(<SpellWordsControl />);
    await expectNoA11yViolations();
  });
});
