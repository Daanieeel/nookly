import { ensureShikiLanguage, isShikiLanguageLoaded, shikiSpans } from "./shiki-highlighter";
import {
  ensureTwinkleplopLanguage,
  isTwinkleplopLanguageLoaded,
  twinkleplopLanguage,
  twinkleplopSpans,
} from "./twinkleplop-highlighter";

/// One highlighted run inside a code block, relative to the block's own text.
export interface TokenSpan {
  from: number;
  to: number;
  style: string;
}

/// Routes each language to one of two highlighters: twinkleplop for every grammar it ships
/// (~100x faster than Shiki's JS regex engine, which matters because the block being typed in
/// is retokenized synchronously on every keystroke), Shiki for the rest. Both emit the same
/// inline accent styles, so callers never know which one ran.

/// Loads `language`'s grammar, resolving to whether it can now be tokenized.
export async function ensureLanguage(language: string): Promise<boolean> {
  const twinkleplop = twinkleplopLanguage(language);
  if (!twinkleplop) return ensureShikiLanguage(language);
  await ensureTwinkleplopLanguage(twinkleplop);
  return true;
}

export function isLanguageLoaded(language: string): boolean {
  const twinkleplop = twinkleplopLanguage(language);
  return twinkleplop ? isTwinkleplopLanguageLoaded(twinkleplop) : isShikiLanguageLoaded(language);
}

/// Only valid once `ensureLanguage` has resolved to `true` for `language`.
export function highlightSpans(language: string, code: string): TokenSpan[] {
  const twinkleplop = twinkleplopLanguage(language);
  return twinkleplop ? twinkleplopSpans(twinkleplop, code) : shikiSpans(language, code);
}
