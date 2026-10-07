import { create } from "zustand";
import { settings, subscribeSetting } from "#/lib/settings/settings.ts";

/// The language a new code block starts with. A note's own choice wins, then this
/// device's default, then plain text. Existing code blocks never change.

/// The stored value for no language.
export const PLAIN_TEXT = "plaintext";

/// The app wide default, per device like the other preferences.
export const useDefaultCodeLanguage = create<{
  language: string;
  update: (language: string) => void;
}>((set) => ({
  language: settings.get("notes.defaultCodeLanguage"),
  update: (language) => {
    settings.set("notes.defaultCodeLanguage", language);
    set({ language });
  },
}));

subscribeSetting("notes.defaultCodeLanguage", (language) =>
  useDefaultCodeLanguage.setState({ language }),
);

/// The `language` attribute a new code block gets, `null` for plain text.
export function newCodeBlockLanguage(noteLanguage: string | null): string | null {
  const language = noteLanguage || useDefaultCodeLanguage.getState().language;
  return language === PLAIN_TEXT ? null : language;
}
