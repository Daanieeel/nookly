import type { SettingId } from "#/lib/settings/registry.ts";
import { settings, subscribeSetting } from "#/lib/settings/settings.ts";
import { checkWords, configureSpell, ignoreWord, suggestWords } from "#/lib/api/spell.ts";

/// What the spell checker asks of the backend.
export interface SpellApi {
  configure: typeof configureSpell;
  check: typeof checkWords;
  suggest: typeof suggestWords;
  ignore: typeof ignoreWord;
}

const SPELL_SETTINGS: SettingId[] = [
  "notes.spellcheck",
  "notes.spellcheckLanguages",
  "notes.spellcheckWords",
];

/// The spell checker as the editors see it: whether it is on, the answers, and a signal when
/// they may have changed (a language, the user's words or a word that was ignored). It keeps
/// the backend in step with the settings, and does nothing at all while the setting is off.
export function createSpellController(
  api: SpellApi = {
    configure: configureSpell,
    check: checkWords,
    suggest: suggestWords,
    ignore: ignoreWord,
  },
) {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  // Answers wait for the backend to be set up with the current languages.
  let ready: Promise<unknown> = Promise.resolve();

  const enabled = () => settings.get("notes.spellcheck");

  const sync = () => {
    if (!enabled()) {
      notify();
      return;
    }
    ready = api
      .configure(settings.get("notes.spellcheckLanguages"), settings.get("notes.spellcheckWords"))
      .catch(() => [])
      .then(notify);
  };
  const stops = SPELL_SETTINGS.map((id) => subscribeSetting(id, sync));
  if (enabled()) sync();

  return {
    enabled,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /// Whether each word is spelled right. Everything is right while the checker is off or
    /// cannot answer: a failure never turns into red underlines.
    async check(words: string[]): Promise<boolean[]> {
      if (!enabled()) return words.map(() => true);
      await ready;
      return api.check(words).catch(() => words.map(() => true));
    },
    async suggest(word: string): Promise<string[]> {
      if (!enabled()) return [];
      await ready;
      return api.suggest(word).catch(() => []);
    },
    /// Accepts a word until Nookly is closed.
    async ignore(word: string) {
      await api.ignore(word).catch(() => {});
      notify();
    },
    /// Adds a word to the user's own dictionary, which is kept in the settings.
    addWord(word: string) {
      const trimmed = word.trim();
      const words = settings.get("notes.spellcheckWords");
      if (!trimmed || words.includes(trimmed)) return;
      settings.set("notes.spellcheckWords", [...words, trimmed]);
    },
    dispose() {
      for (const stop of stops) stop();
      listeners.clear();
    },
  };
}

export type SpellController = ReturnType<typeof createSpellController>;

let shared: SpellController | null = null;

/// The checker every editor shares, made the first time an editor asks for it.
export function spellController(): SpellController {
  shared ??= createSpellController();
  return shared;
}
