/// The languages the spell checker has a dictionary for: the Hunspell dictionaries compiled
/// into the app (`src-tauri/dictionaries`, read by `src/spelling.rs`), each read only when its
/// language is switched on.

export interface SpellLanguage {
  code: string;
  label: string;
}

export const SPELL_LANGUAGES: SpellLanguage[] = [
  { code: "en", label: "English (US)" },
  { code: "en-gb", label: "English (UK)" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
];

export const SPELL_LANGUAGE_CODES = SPELL_LANGUAGES.map((language) => language.code);

export function isSpellLanguage(code: string): boolean {
  return SPELL_LANGUAGE_CODES.includes(code);
}

/// The languages to start with, from the languages of the computer (`navigator.languages`):
/// each one there is a dictionary for, and English when none is. German and English together
/// is the likeliest pair for a student here, so a German computer gets both.
export function suggestedSpellLanguages(preferred: readonly string[]): string[] {
  const found: string[] = [];
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    const code = SPELL_LANGUAGE_CODES.find((c) => c === lower) ?? lower.split("-")[0];
    if (isSpellLanguage(code) && !found.includes(code)) found.push(code);
  }
  if (found.length === 0) return ["en"];
  const english = found.some((c) => c === "en" || c === "en-gb");
  return english ? found : [...found, "en"];
}
