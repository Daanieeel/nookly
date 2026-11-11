import { describe, expect, it } from "vitest";
import {
  SPELL_LANGUAGES,
  SPELL_LANGUAGE_CODES,
  isSpellLanguage,
  suggestedSpellLanguages,
} from "./spell-languages";

describe("the languages", () => {
  it("have a code and a label each, without repeats", () => {
    expect(new Set(SPELL_LANGUAGE_CODES).size).toBe(SPELL_LANGUAGES.length);
    for (const language of SPELL_LANGUAGES) expect(language.label).not.toBe("");
  });

  it("know which codes there is a dictionary for", () => {
    expect(isSpellLanguage("de")).toBe(true);
    expect(isSpellLanguage("tlh")).toBe(false);
  });
});

describe("suggestedSpellLanguages", () => {
  it("starts with English when nothing else is known", () => {
    expect(suggestedSpellLanguages([])).toEqual(["en"]);
    expect(suggestedSpellLanguages(["tlh", "ja-JP"])).toEqual(["en"]);
  });

  it("takes the languages of the computer, with the region left out", () => {
    expect(suggestedSpellLanguages(["fr-CA"])).toEqual(["fr", "en"]);
  });

  it("gives a German computer German and English", () => {
    expect(suggestedSpellLanguages(["de-DE", "en-US"])).toEqual(["de", "en"]);
    expect(suggestedSpellLanguages(["de-DE"])).toEqual(["de", "en"]);
  });

  it("keeps British English as it is and does not add US English to it", () => {
    expect(suggestedSpellLanguages(["en-GB"])).toEqual(["en-gb"]);
  });

  it("lists a language once", () => {
    expect(suggestedSpellLanguages(["en-US", "en", "en-US"])).toEqual(["en"]);
  });
});
