import { createHighlighterCore, type HighlighterCore, type LanguageInput } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { nooklyShikiTheme, NOOKLY_THEME_NAME } from "./shiki-theme";

export { NOOKLY_THEME_NAME as SHIKI_THEME_NAME };

/// One entry per grammar `CodeBlockLanguagePicker` can select (`code-languages.ts`), plus `toml`
/// — not a picker entry of its own (the picker folds it into "INI / TOML"), but a real Shiki
/// grammar in its own right, unlike highlight.js which had no TOML grammar and aliased it onto
/// INI. Each module embeds its own aliases (loading `typescript` also registers `ts`, loading
/// `javascript` also registers `js`, etc. — verified against the installed package), so the
/// fence shortcut's and CLI's raw `--language ts`/`js` values resolve with no extra mapping.
const LANGUAGE_LOADERS = {
  bash: () => import("@shikijs/langs/bash"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  ini: () => import("@shikijs/langs/ini"),
  toml: () => import("@shikijs/langs/toml"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  yaml: () => import("@shikijs/langs/yaml"),
} satisfies Record<string, () => Promise<{ default: LanguageInput }>>;

let highlighterPromise: Promise<HighlighterCore> | null = null;

/// Lazily created once and reused for the app's lifetime — building it is the only async step
/// (loading each grammar's JSON via the loaders above); tokenizing with an already-built instance
/// is synchronous. Uses the pure-JS regex engine (no WASM/Oniguruma) — this app only needs
/// tokenizing for a handful of languages, not the full Oniguruma regex feature set, and it drops
/// the ~450KB WASM binary that engine would otherwise pull in.
export function getShikiHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [nooklyShikiTheme],
    langs: Object.values(LANGUAGE_LOADERS).map((load) => load().then((mod) => mod.default)),
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}
