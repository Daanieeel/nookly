import emojiGroups from "unicode-emoji-json/data-by-group.json";

export interface EmojiEntry {
  emoji: string;
  name: string;
}

export const ALL_EMOJI: EmojiEntry[] = emojiGroups.flatMap((g) => g.emojis);

export interface SymbolEntry {
  char: string;
  name: string;
  /// Other words someone might type, including the ASCII way to write it.
  keywords: string[];
}

const symbol = (char: string, name: string, ...keywords: string[]): SymbolEntry => ({
  char,
  name,
  keywords,
});

/// Symbols that emoji do not cover well: math, arrows, Greek letters, typography.
export const SYMBOLS: SymbolEntry[] = [
  symbol("✓", "check mark", "tick", "done", "yes"),
  symbol("✗", "cross mark", "no", "wrong", "x"),
  symbol("→", "right arrow", "->", "to"),
  symbol("←", "left arrow", "<-", "back"),
  symbol("↑", "up arrow"),
  symbol("↓", "down arrow"),
  symbol("↔", "left right arrow", "<->"),
  symbol("⇒", "implies", "double right arrow", "=>"),
  symbol("⇐", "implied by", "double left arrow"),
  symbol("⇔", "if and only if", "iff", "double arrow", "<=>"),
  symbol("≤", "less than or equal", "<=", "le", "leq"),
  symbol("≥", "greater than or equal", ">=", "ge", "geq"),
  symbol("≠", "not equal", "!=", "ne", "neq"),
  symbol("≈", "approximately equal", "approx", "almost"),
  symbol("≡", "identical to", "equivalent", "congruent"),
  symbol("∞", "infinity", "inf"),
  symbol("°", "degree", "deg", "temperature"),
  symbol("±", "plus minus", "+-", "pm"),
  symbol("×", "multiplication", "times", "cross"),
  symbol("÷", "division", "divide"),
  symbol("√", "square root", "sqrt", "root"),
  symbol("∑", "sum", "sigma", "summation"),
  symbol("∏", "product", "pi"),
  symbol("∫", "integral"),
  symbol("∂", "partial derivative", "partial"),
  symbol("∈", "element of", "in", "member"),
  symbol("∉", "not an element of", "not in"),
  symbol("∅", "empty set", "null"),
  symbol("∩", "intersection", "and"),
  symbol("∪", "union", "or"),
  symbol("⊂", "subset"),
  symbol("⊆", "subset or equal"),
  symbol("∀", "for all", "forall"),
  symbol("∃", "there exists", "exists"),
  symbol("∴", "therefore"),
  symbol("∵", "because"),
  symbol("¬", "not", "negation"),
  symbol("∧", "logical and", "wedge"),
  symbol("∨", "logical or", "vee"),
  symbol("α", "alpha", "greek"),
  symbol("β", "beta", "greek"),
  symbol("γ", "gamma", "greek"),
  symbol("δ", "delta", "greek"),
  symbol("ε", "epsilon", "greek"),
  symbol("θ", "theta", "greek"),
  symbol("λ", "lambda", "greek"),
  symbol("μ", "mu", "micro", "greek"),
  symbol("π", "pi", "greek"),
  symbol("ρ", "rho", "greek"),
  symbol("σ", "sigma", "greek"),
  symbol("τ", "tau", "greek"),
  symbol("φ", "phi", "greek"),
  symbol("ω", "omega", "greek"),
  symbol("Δ", "capital delta", "change", "greek"),
  symbol("Σ", "capital sigma", "greek"),
  symbol("Ω", "capital omega", "ohm", "greek"),
  symbol("•", "bullet", "dot", "point"),
  symbol("…", "ellipsis", "dots"),
  symbol("¶", "paragraph", "pilcrow"),
  symbol("§", "section"),
  symbol("©", "copyright"),
  symbol("®", "registered"),
  symbol("™", "trademark"),
  symbol("€", "euro", "money"),
  symbol("£", "pound", "money"),
  symbol("¥", "yen", "money"),
  symbol("½", "one half", "1/2"),
  symbol("¼", "one quarter", "1/4"),
  symbol("¾", "three quarters", "3/4"),
  symbol("²", "squared", "superscript two"),
  symbol("³", "cubed", "superscript three"),
];

/// How well `text` matches `term`: 0 starts with it, 1 a word does, 2 it appears
/// inside, `null` not at all.
function rank(text: string, term: string): number | null {
  const lower = text.toLowerCase();
  if (lower.startsWith(term)) return 0;
  if (lower.split(/[\s_]+/).some((word) => word.startsWith(term))) return 1;
  return lower.includes(term) ? 2 : null;
}

/// The query and its stem, so "smile" finds "smiling" and "heart" finds "hearts".
function termsOf(query: string): string[] {
  const needle = query.trim().toLowerCase();
  const stem = needle.replace(/(ing|ed|es|e|y|s)$/, "");
  return stem.length >= 3 && stem !== needle ? [needle, stem] : [needle];
}

/// Lower is better: the kind of match first, then the shorter name, so "fire" beats
/// "firefighter" and "smile" reaches "smiling face" before longer names.
function best(fields: string[], terms: string[]): number | null {
  let result: number | null = null;
  for (const field of fields) {
    for (const term of terms) {
      const r = rank(field, term);
      const score = r === null ? null : r * 100 + field.length;
      if (score !== null && (result === null || score < result)) result = score;
    }
  }
  return result;
}

function search<T>(items: T[], query: string, fieldsOf: (item: T) => string[], limit: number) {
  if (query.trim() === "") return [];
  const terms = termsOf(query);
  return items
    .map((item, index) => ({ item, index, score: best(fieldsOf(item), terms) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .toSorted((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}

export function searchEmoji(query: string, limit = 10): EmojiEntry[] {
  return search(ALL_EMOJI, query, (e) => [e.name], limit);
}

export function searchSymbols(query: string, limit = 6): SymbolEntry[] {
  return search(SYMBOLS, query, (s) => [s.name, ...s.keywords], limit);
}

/// What the picker shows right after the colon, before anything is typed: the symbols
/// people reach for most, then the emoji they use most.
const FEATURED_SYMBOL_COUNT = 8;
const FEATURED_EMOJI = [
  "😀",
  "😂",
  "🙂",
  "😍",
  "🤔",
  "👍",
  "🙏",
  "👏",
  "🎉",
  "🔥",
  "❤️",
  "✅",
  "⭐",
  "💡",
  "📌",
  "⚠️",
];

export function featuredSymbols(): SymbolEntry[] {
  return SYMBOLS.slice(0, FEATURED_SYMBOL_COUNT);
}

export function featuredEmoji(): EmojiEntry[] {
  return FEATURED_EMOJI.flatMap((emoji) => ALL_EMOJI.find((e) => e.emoji === emoji) ?? []);
}
