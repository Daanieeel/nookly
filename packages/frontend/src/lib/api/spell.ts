import { invoke } from "@tauri-apps/api/core";

/// The spell checker lives in the backend (`src/spelling.rs`): it reads Hunspell dictionaries,
/// which know compound words, and nothing here writes anything.

/// Switches on these languages and sets the user's own words. Returns the languages that are
/// on, which leaves out any that has no dictionary.
export function configureSpell(languages: string[], personal: string[]): Promise<string[]> {
  return invoke("spell_configure", { languages, personal });
}

/// Whether each word is spelled right, in the same order.
export function checkWords(words: string[]): Promise<boolean[]> {
  return invoke("spell_check", { words });
}

export function suggestWords(word: string): Promise<string[]> {
  return invoke("spell_suggest", { word });
}

/// Accepts a word until Nookly is closed.
export function ignoreWord(word: string): Promise<void> {
  return invoke("spell_ignore", { word });
}
