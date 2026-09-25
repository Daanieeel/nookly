import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageInput,
  type ThemedToken,
} from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type { TokenSpan } from "./highlighter";
import { nooklyShikiTheme, NOOKLY_THEME_NAME } from "./shiki-theme";

/// Fallback grammars for the picker entries (`code-languages.ts`) twinkleplop doesn't ship yet;
/// every other language is tokenized by `twinkleplop-highlighter.ts` instead (see
/// `highlighter.ts`). `jsonc` stays here because twinkleplop's JSON grammar skips comments
/// rather than coloring them. Each module embeds its own aliases, so a raw `--language` value
/// like `c++` or `rb` resolves with no extra mapping.
const LANGUAGE_LOADERS = {
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  ini: () => import("@shikijs/langs/ini"),
  java: () => import("@shikijs/langs/java"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  php: () => import("@shikijs/langs/php"),
  ruby: () => import("@shikijs/langs/ruby"),
} satisfies Record<string, () => Promise<{ default: LanguageInput }>>;

let highlighterPromise: Promise<HighlighterCore> | null = null;
/// Set once `highlighterPromise` resolves, for the synchronous `shikiSpans`.
let highlighter: HighlighterCore | null = null;

/// Lazily created once, the first time a code block uses a fallback language, and reused for the
/// app's lifetime. Each grammar is pulled in by `ensureShikiLanguage` on first use, so opening a
/// page never waits on grammars it doesn't show. Uses the pure-JS regex engine (no
/// WASM/Oniguruma) — this app only needs tokenizing for a handful of languages, not the full
/// Oniguruma regex feature set, and it drops the ~450KB WASM binary that engine would otherwise
/// pull in.
function getShikiHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [nooklyShikiTheme],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }).then((created) => (highlighter = created));
  return highlighterPromise;
}

/// Languages Shiki renders without a grammar; there is nothing to load or tokenize for them.
const PLAIN_LANGUAGES = new Set(["plaintext", "text", "txt", "plain"]);

function isLoaderKey(language: string): language is keyof typeof LANGUAGE_LOADERS {
  return language in LANGUAGE_LOADERS;
}

const languageLoads = new Map<string, Promise<boolean>>();

/// Loads `language`'s grammar into the shared highlighter, resolving to whether it can now be
/// tokenized. A value that isn't a loader key (an alias like `ts`, or a typo from the CLI) falls
/// back to loading every grammar once, since each module registers its own aliases.
export function ensureShikiLanguage(language: string): Promise<boolean> {
  if (PLAIN_LANGUAGES.has(language)) return Promise.resolve(false);
  let load = languageLoads.get(language);
  if (!load) {
    load = (async () => {
      const shiki = await getShikiHighlighter();
      if (shiki.getLoadedLanguages().includes(language)) return true;
      const loaders = isLoaderKey(language)
        ? [LANGUAGE_LOADERS[language]]
        : Object.values(LANGUAGE_LOADERS);
      const modules = await Promise.all(loaders.map((loader) => loader()));
      await shiki.loadLanguage(...modules.map((mod) => mod.default));
      return shiki.getLoadedLanguages().includes(language);
    })();
    languageLoads.set(language, load);
  }
  return load;
}

export function isShikiLanguageLoaded(language: string): boolean {
  return highlighter?.getLoadedLanguages().includes(language) ?? false;
}

/// Standard TextMate/VS Code bitmask values (`vscode-textmate`'s own `FontStyle` enum, defined
/// locally rather than imported since that package only exports it as a type, not a runtime
/// value) — a token's `fontStyle` ORs these together.
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

function decorationStyle(token: ThemedToken): string | null {
  if (!token.color) return null;
  let style = `color:${token.color}`;
  if (token.fontStyle) {
    if (token.fontStyle & FONT_STYLE_ITALIC) style += ";font-style:italic";
    if (token.fontStyle & FONT_STYLE_BOLD) style += ";font-weight:700";
    if (token.fontStyle & FONT_STYLE_UNDERLINE) style += ";text-decoration:underline";
  }
  return style;
}

/// Only valid once `ensureShikiLanguage` has resolved to `true` for `language`.
export function shikiSpans(language: string, code: string): TokenSpan[] {
  if (!highlighter) return [];
  const spans: TokenSpan[] = [];
  const lines = highlighter.codeToTokensBase(code, { lang: language, theme: NOOKLY_THEME_NAME });
  for (const line of lines) {
    for (const token of line) {
      const style = decorationStyle(token);
      if (!style) continue;
      spans.push({ from: token.offset, to: token.offset + token.content.length, style });
    }
  }
  return spans;
}
