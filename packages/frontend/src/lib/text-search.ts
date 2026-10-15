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

/// Folded text without its spaces, so `heading2`, `heading 2` and `Heading 2` compare equal.
function compact(text: string): string {
  return foldText(text).replaceAll(/\s+/gu, "");
}

/// Whether the letters of `needle` appear in `text` in order, not necessarily next to
/// each other: `hxd` is in `hexa decimal`.
function isSubsequence(needle: string, text: string): boolean {
  let next = 0;
  for (const char of text) {
    if (char === needle[next]) next++;
    if (next === needle.length) return true;
  }
  return needle.length === 0;
}

/// The items that match `needle` in any of their `terms`, best matches first: a term
/// that starts with it, then one that contains it, then one that only has its letters in
/// order (`bkmk` finds "Web bookmark"). Spaces and case are ignored, so `/heading2`
/// finds "Heading 2". The given order is kept inside each group, so `in` lists "Inline
/// math" ahead of "Heading".
export function rankMatches<T>(items: T[], needle: string, terms: (item: T) => string[]): T[] {
  const wanted = compact(needle);
  if (wanted === "") return items;
  const tiers: T[][] = [[], [], []];
  for (const item of items) {
    const all = terms(item).map(compact);
    if (all.some((term) => term.startsWith(wanted))) tiers[0].push(item);
    else if (all.some((term) => term.includes(wanted))) tiers[1].push(item);
    else if (all.some((term) => isSubsequence(wanted, term))) tiers[2].push(item);
  }
  return tiers.flat();
}
