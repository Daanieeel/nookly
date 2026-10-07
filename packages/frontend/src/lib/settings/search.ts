/// Fuzzy search over settings. A query is split into words, and every word has to
/// match somewhere (AND). A word matches a field word exactly, as a prefix, as a
/// substring (3+ letters) or with a typo (one edit from 4 letters, two from 8). Where
/// it matches decides the weight: title, then synonyms, then id, then description.

export interface Searchable {
  id: string;
  title: string;
  description: string;
  synonyms: string[];
}

const WEIGHT = { title: 10, synonyms: 6, id: 4, description: 2 };
const MATCH = { exact: 1, prefix: 0.8, substring: 0.5, typo: 0.4 };
/// Added once when a multi word query appears in a title or synonym as written.
const PHRASE_BONUS = { title: 5, synonyms: 3 };

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function words(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/// `backupFolder` reads as "backup folder" and as "backupfolder".
function idWords(id: string): string[] {
  const split = id.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const joined = id.split(".").map((part) => fold(part));
  return [...words(split), ...joined];
}

/// Edits (insert, delete, replace, swap of neighbours) between two strings.
export function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function allowedTypos(length: number): number {
  if (length >= 8) return 2;
  return length >= 4 ? 1 : 0;
}

/// How well `word` matches one word of a field, 0 for not at all.
function matchWord(word: string, target: string): number {
  if (word === target) return MATCH.exact;
  if (target.startsWith(word)) return MATCH.prefix;
  if (word.length >= 3 && target.includes(word)) return MATCH.substring;
  const typos = allowedTypos(word.length);
  if (typos === 0) return 0;
  // The start of a longer word counts too, so a typo still matches while typing.
  const near = [target, target.slice(0, word.length)];
  return near.some((t) => editDistance(word, t) <= typos) ? MATCH.typo : 0;
}

function matchField(word: string, targets: string[]): number {
  return targets.reduce((best, target) => Math.max(best, matchWord(word, target)), 0);
}

/// 0 when `query` does not match `item`, otherwise higher is better. A blank query matches everything.
export function scoreSetting(query: string, item: Searchable): number {
  const queryWords = words(query);
  if (queryWords.length === 0) return 1;
  const fields = [
    { weight: WEIGHT.title, targets: words(item.title) },
    { weight: WEIGHT.synonyms, targets: item.synonyms.flatMap(words) },
    { weight: WEIGHT.id, targets: idWords(item.id) },
    { weight: WEIGHT.description, targets: words(item.description) },
  ];
  let total = 0;
  for (const word of queryWords) {
    let best = 0;
    for (const { weight, targets } of fields) {
      best = Math.max(best, matchField(word, targets) * weight);
    }
    if (best === 0) return 0;
    total += best;
  }
  if (queryWords.length > 1) {
    const phrase = queryWords.join(" ");
    if (words(item.title).join(" ").includes(phrase)) total += PHRASE_BONUS.title;
    if (item.synonyms.some((s) => words(s).join(" ").includes(phrase))) {
      total += PHRASE_BONUS.synonyms;
    }
  }
  return total;
}

/// The items matching `query`, best first. Equal scores keep their original order.
export function searchSettings<T extends Searchable>(query: string, items: T[]): T[] {
  if (words(query).length === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreSetting(query, item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
