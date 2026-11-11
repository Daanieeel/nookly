import { invoke } from "@tauri-apps/api/core";

/// The spell checker lives in the backend (`src/spelling.rs`): it reads Hunspell dictionaries,
/// which know compound words, and nothing here writes anything.

/// Switches on these languages, with the words from the dictionary file. Returns the languages
/// that are on, which leaves out any that has no dictionary.
export function configureSpell(languages: string[]): Promise<string[]> {
  return invoke("spell_configure", { languages });
}

/// Reads the dictionary file again. Resolves to whether its words are not the ones the checker had.
export function reloadWords(): Promise<boolean> {
  return invoke("spell_reload_words");
}

/// Adds a word to the dictionary file (`dictionary.json`). Rejects when that file cannot be
/// read, and leaves it as it is.
export function addWord(word: string): Promise<void> {
  return invoke("spell_add_word", { word });
}

/// Shows `dictionary.json` in Finder (the file manager), creating it first when it does not exist.
export function revealDictionaryFile(): Promise<void> {
  return invoke("reveal_dictionary_file");
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
