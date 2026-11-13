import { createHighlighterCoreSync } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import asm from "@shikijs/langs/asm";
import bash from "@shikijs/langs/bash";
import c from "@shikijs/langs/c";
import cpp from "@shikijs/langs/cpp";
import csharp from "@shikijs/langs/csharp";
import css from "@shikijs/langs/css";
import go from "@shikijs/langs/go";
import html from "@shikijs/langs/html";
import ini from "@shikijs/langs/ini";
import java from "@shikijs/langs/java";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsonc from "@shikijs/langs/jsonc";
import jsx from "@shikijs/langs/jsx";
import markdown from "@shikijs/langs/markdown";
import php from "@shikijs/langs/php";
import python from "@shikijs/langs/python";
import ruby from "@shikijs/langs/ruby";
import rust from "@shikijs/langs/rust";
import sql from "@shikijs/langs/sql";
import toml from "@shikijs/langs/toml";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";
import { NOOKLY_THEME_NAME, nooklyShikiTheme } from "@nookly/frontend/lib/code-theme";

/// One coloured run inside a code block, relative to the block's own text.
export interface CodeSpan {
  from: number;
  to: number;
  style: string;
}

/// Every language the desktop's picker offers, highlighted with the desktop's colours. Made
/// on first use, with every grammar at once: the phone has no network to fetch one later.
let highlighter: ReturnType<typeof createHighlighterCoreSync> | null = null;
const get = () =>
  (highlighter ??= createHighlighterCoreSync({
    themes: [nooklyShikiTheme],
    langs: [
      asm,
      bash,
      c,
      cpp,
      csharp,
      css,
      go,
      html,
      ini,
      java,
      javascript,
      json,
      jsonc,
      jsx,
      markdown,
      php,
      python,
      ruby,
      rust,
      sql,
      toml,
      tsx,
      typescript,
      yaml,
    ].flat(),
    engine: createJavaScriptRegexEngine(),
  }));

/// The coloured runs of `code` in `language`; none for plain text or a language the phone
/// doesn't know, which then shows uncoloured rather than failing.
export function codeSpans(language: string, code: string): CodeSpan[] {
  const shiki = get();
  if (!code || !shiki.getLoadedLanguages().includes(language)) return [];
  // No time limit: the first block of a language compiles its grammar, which can take a
  // moment; the editor highlights in the background, so nothing waits on it.
  const lines = shiki.codeToTokensBase(code, {
    lang: language,
    theme: NOOKLY_THEME_NAME,
    tokenizeTimeLimit: 0,
  });
  const spans: CodeSpan[] = [];
  for (const token of lines.flat()) {
    if (!token.content.trim()) continue;
    const style = [
      token.color ? `color: ${token.color}` : "",
      // Shiki's flags: 1 is italic.
      (token.fontStyle ?? 0) & 1 ? "font-style: italic" : "",
    ]
      .filter(Boolean)
      .join("; ");
    if (style) spans.push({ from: token.offset, to: token.offset + token.content.length, style });
  }
  return spans;
}
