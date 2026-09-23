import type { TokenSpan } from "./highlighter";

/// The output of each package's `tokenize()` factory. Declared locally rather than imported from
/// `@twinkleplop/core` so the 0.x API's shape is pinned down in one place: `tokens` is flat
/// `(type_id, start, end)` triples indexing into `token_types`.
type TwinkleplopTokenizer = (input: string) => { tokens: Uint32Array; token_types: string[] };

/// One entry per grammar twinkleplop ships that `CodeBlockLanguagePicker` can select. Everything
/// else (C++, C#, Java, PHP, Ruby, INI, JSONC) stays on Shiki until twinkleplop covers it; moving
/// one over is adding its line here and removing it from `shiki-highlighter.ts`.
const LANGUAGE_LOADERS = {
  bash: () => import("@twinkleplop/bash"),
  css: () => import("@twinkleplop/css"),
  go: () => import("@twinkleplop/go"),
  html: () => import("@twinkleplop/html"),
  javascript: () => import("@twinkleplop/javascript"),
  json: () => import("@twinkleplop/json"),
  markdown: () => import("@twinkleplop/markdown"),
  python: () => import("@twinkleplop/python"),
  rust: () => import("@twinkleplop/rust"),
  sql: () => import("@twinkleplop/sql"),
  toml: () => import("@twinkleplop/toml"),
  tsx: () => import("@twinkleplop/tsx"),
  typescript: () => import("@twinkleplop/typescript"),
  yaml: () => import("@twinkleplop/yaml"),
} satisfies Record<string, () => Promise<{ tokenize: () => TwinkleplopTokenizer }>>;

type TwinkleplopLanguage = keyof typeof LANGUAGE_LOADERS;

/// Unlike Shiki's grammar modules, twinkleplop packages register no aliases of their own, so the
/// short forms the fence shortcut and CLI store verbatim are resolved here. `jsx` goes through the
/// TSX grammar: the plain JavaScript one has no JSX support and reads `</div>` as a regex.
const ALIASES = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  js: "javascript",
  jsx: "tsx",
  md: "markdown",
  py: "python",
  rs: "rust",
  ts: "typescript",
  yml: "yaml",
} satisfies Record<string, TwinkleplopLanguage>;

function isAlias(language: string): language is keyof typeof ALIASES {
  return language in ALIASES;
}

function isLoaderKey(language: string): language is TwinkleplopLanguage {
  return language in LANGUAGE_LOADERS;
}

export function twinkleplopLanguage(language: string): TwinkleplopLanguage | undefined {
  if (isAlias(language)) return ALIASES[language];
  if (isLoaderKey(language)) return language;
  return undefined;
}

const COMMENT = "color:var(--muted-foreground);font-style:italic";
const PINK = "color:var(--accent-pink)";
const GREEN = "color:var(--accent-green)";
const PURPLE = "color:var(--accent-purple)";
const BLUE = "color:var(--accent-blue)";

/// Twinkleplop's token types (one vocabulary shared by every language package) reduced onto the
/// same four accent tokens `shiki-theme.ts` maps TextMate scopes onto, so a block reads the same
/// whichever highlighter tokenized it. Types absent here (punctuation, operators, numbers, ...)
/// render in the plain foreground color, as they do under Shiki.
const TYPE_STYLES = {
  comment: COMMENT,
  keyword: PINK,
  boolean: PINK,
  null: PINK,
  doctype: PINK,
  string: GREEN,
  template: GREEN,
  regex: GREEN,
  string_escape: GREEN,
  escape: GREEN,
  code: GREEN,
  function: PURPLE,
  builtin: PURPLE,
  heading: PURPLE,
  identifier: PURPLE,
  variable: PURPLE,
  constant: PURPLE,
  parameter: PURPLE,
  property: PURPLE,
  attr_name: PURPLE,
  attribute: PURPLE,
  css_variable: PURPLE,
  type: BLUE,
  class_name: BLUE,
  namespace: BLUE,
  tag_name: BLUE,
  decorator: BLUE,
  lifetime: BLUE,
  selector: BLUE,
  selector_class: BLUE,
  selector_id: BLUE,
  selector_pseudo: BLUE,
  array_table_header: BLUE,
} satisfies Record<string, string>;

function isStyledType(type: string): type is keyof typeof TYPE_STYLES {
  return type in TYPE_STYLES;
}

const tokenizers = new Map<TwinkleplopLanguage, TwinkleplopTokenizer>();
const loads = new Map<TwinkleplopLanguage, Promise<void>>();

export function ensureTwinkleplopLanguage(language: TwinkleplopLanguage): Promise<void> {
  let load = loads.get(language);
  if (!load) {
    load = LANGUAGE_LOADERS[language]().then((mod) => {
      tokenizers.set(language, mod.tokenize());
    });
    loads.set(language, load);
  }
  return load;
}

export function isTwinkleplopLanguageLoaded(language: TwinkleplopLanguage): boolean {
  return tokenizers.has(language);
}

/// Only valid once `ensureTwinkleplopLanguage` has resolved for `language`.
export function twinkleplopSpans(language: TwinkleplopLanguage, code: string): TokenSpan[] {
  const tokenizer = tokenizers.get(language);
  if (!tokenizer) return [];
  const { tokens, token_types } = tokenizer(code);
  const spans: TokenSpan[] = [];
  for (let i = 0; i < tokens.length; i += 3) {
    const type = token_types[tokens[i]];
    if (isStyledType(type))
      spans.push({ from: tokens[i + 1], to: tokens[i + 2], style: TYPE_STYLES[type] });
  }
  return spans;
}
