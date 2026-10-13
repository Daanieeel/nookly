/// Text made comparable for a search: accents and case dropped, and composed and
/// decomposed spellings of the same letter made one. macOS saves file names decomposed
/// (`U` and a combining mark), while a keyboard types `Ü` as one character, so a plain
/// comparison would never match them. `ubung` finds `Übungsblatt` too.
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(SPELLED_OUT, (letter) => SPELLED_OUT_AS.get(letter) ?? letter);
}

/// Letters that do not decompose into a base letter and a mark, so they are spelled the
/// way a keyboard without them does: `ß` as `ss`, `ø` as `o`, `ł` as `l`.
const SPELLED_OUT_AS = new Map([
  ["ß", "ss"],
  ["æ", "ae"],
  ["œ", "oe"],
  ["ø", "o"],
  ["ð", "d"],
  ["đ", "d"],
  ["þ", "th"],
  ["ł", "l"],
  ["ı", "i"],
]);
const SPELLED_OUT = new RegExp(`[${[...SPELLED_OUT_AS.keys()].join("")}]`, "gu");

/// Whether `text` contains `needle`, ignoring case and accents.
export function includesFolded(text: string, needle: string): boolean {
  return foldText(text).includes(foldText(needle));
}

/// The items that match `needle` in any of their `terms`, those with a term that
/// starts with it before those that only contain it. The given order is kept inside
/// each group, so `in` lists "Inline math" ahead of "Heading".
export function prefixFirst<T>(items: T[], needle: string, terms: (item: T) => string[]): T[] {
  const folded = foldText(needle);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const all = terms(item).map(foldText);
    if (all.some((term) => term.startsWith(folded))) starts.push(item);
    else if (all.some((term) => term.includes(folded))) contains.push(item);
  }
  return [...starts, ...contains];
}
