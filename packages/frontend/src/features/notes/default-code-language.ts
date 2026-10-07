import { create } from "zustand";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";

/// The language a new code block starts with. A note's own choice wins, then this
/// device's default, then plain text. Existing code blocks never change.

/// The stored value for no language.
export const PLAIN_TEXT = "plaintext";

function read(): string {
  return preferences.get(STORAGE_KEYS.codeLanguage) || PLAIN_TEXT;
}

/// The app wide default, per device like the other preferences.
export const useDefaultCodeLanguage = create<{
  language: string;
  update: (language: string) => void;
}>((set) => ({
  language: read(),
  update: (language) => {
    preferences.set(STORAGE_KEYS.codeLanguage, language);
    set({ language });
  },
}));

/// The `language` attribute a new code block gets, `null` for plain text.
export function newCodeBlockLanguage(noteLanguage: string | null): string | null {
  const language = noteLanguage || useDefaultCodeLanguage.getState().language;
  return language === PLAIN_TEXT ? null : language;
}
