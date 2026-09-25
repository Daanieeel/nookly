import type { SearchHit, Space } from "#/lib/api/types.ts";

/// Fixed order of entity type subgroups inside a Space group in the Cmd+K
/// results. Never re-sorted by count or relevance, so the grouped structure
/// stays put while the user types; only items inside a subgroup are ranked.
export const TYPE_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "tasks", label: "Tasks", types: ["task", "sub_task"] },
  { key: "notes", label: "Notes", types: ["note"] },
  { key: "jots", label: "Jots", types: ["jot"] },
  { key: "courses", label: "Courses", types: ["course"] },
  { key: "semesters", label: "Semesters", types: ["semester"] },
  { key: "sessions", label: "Sessions", types: ["session", "session_template"] },
  { key: "exams", label: "Exams", types: ["exam"] },
  { key: "decks", label: "Decks", types: ["index_card_deck"] },
  { key: "study_blocks", label: "Study Blocks", types: ["study_block"] },
  { key: "assignments", label: "Assignments", types: ["assignment"] },
  { key: "files", label: "Files", types: ["file"] },
  { key: "bookmarks", label: "Bookmarks", types: ["bookmark"] },
];

const OTHER_GROUP = { key: "other", label: "Other" };

export interface HitTypeGroup {
  key: string;
  label: string;
  hits: SearchHit[];
}

export interface HitSpaceGroup {
  space: Space;
  types: HitTypeGroup[];
}

export function typeGroupFor(type: string): { key: string; label: string } {
  return TYPE_GROUPS.find((g) => g.types.includes(type)) ?? OTHER_GROUP;
}

/// Groups search hits by Space (in sidebar order), then by entity type (in
/// `TYPE_GROUPS` order). Hits keep the backend's relevance order within a
/// subgroup, which already puts title matches ahead of block matches.
export function groupHits(hits: SearchHit[], spaces: Space[]): HitSpaceGroup[] {
  const order = [...TYPE_GROUPS.map((g) => g.key), OTHER_GROUP.key];
  return spaces.flatMap((space) => {
    const inSpace = hits.filter((h) => h.spaceId === space.id);
    if (inSpace.length === 0) return [];
    const byType = new Map<string, HitTypeGroup>();
    for (const hit of inSpace) {
      const group = typeGroupFor(hit.type);
      const existing = byType.get(group.key);
      if (existing) existing.hits.push(hit);
      else byType.set(group.key, { ...group, hits: [hit] });
    }
    const types = [...byType.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return [{ space, types }];
  });
}

export interface TextSegment {
  text: string;
  match: boolean;
}

const SNIPPET_OPEN = "\u0001";
const SNIPPET_CLOSE = "\u0002";

/// Turns a backend block snippet (raw block markdown with matched terms wrapped
/// in `\u0001`/`\u0002`) into readable, highlightable text: mention and link
/// markup collapse to their label, inline markdown markers and table tabs go.
export function snippetSegments(snippet: string): TextSegment[] {
  const readable = snippet
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\]\((?:mention:)?[^)\s]*\)?/g, "")
    .replace(/\[/g, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/^\s*(#{1,6}|>|[-*]|\d+\.)\s+/gm, "")
    .replace(/[\t\n]+/g, "  ")
    .trim();

  const segments: TextSegment[] = [];
  let match = false;
  let buffer = "";
  for (const char of readable) {
    if (char === SNIPPET_OPEN || char === SNIPPET_CLOSE) {
      if (buffer) segments.push({ text: buffer, match });
      buffer = "";
      match = char === SNIPPET_OPEN;
    } else buffer += char;
  }
  if (buffer) segments.push({ text: buffer, match });
  return segments;
}

/// Splits `text` into segments, marking every case-insensitive occurrence of
/// any whitespace separated word in `query`.
export function termSegments(text: string, query: string): TextSegment[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = lower.indexOf(term);
    while (from !== -1) {
      marked.fill(true, from, from + term.length);
      from = lower.indexOf(term, from + term.length);
    }
  }
  return indexSegments(text, marked);
}

function indexSegments(text: string, marked: boolean[]): TextSegment[] {
  const segments: TextSegment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.match === marked[i]) last.text += text[i];
    else segments.push({ text: text[i], match: marked[i] });
  }
  return segments;
}

export interface FuzzyMatch {
  /// Lower is better: 0 exact, 1 prefix, 2 substring, 3 scattered letters.
  tier: number;
  /// Tiebreaker within a tier (substring position or letter gap total).
  spread: number;
  segments: TextSegment[];
}

/// Title only fuzzy match for the Cmd+P quick switcher. Returns `null` when the
/// query's letters don't all appear, in order, in `title`.
export function fuzzyMatch(title: string, query: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return { tier: 0, spread: 0, segments: [{ text: title, match: false }] };
  const lower = title.toLowerCase();
  const marked = new Array<boolean>(title.length).fill(false);

  const at = lower.indexOf(needle);
  if (at !== -1) {
    marked.fill(true, at, at + needle.length);
    const tier = lower === needle ? 0 : at === 0 ? 1 : 2;
    return { tier, spread: at, segments: indexSegments(title, marked) };
  }

  let from = 0;
  let spread = 0;
  for (const char of needle) {
    if (char === " ") continue;
    const found = lower.indexOf(char, from);
    if (found === -1) return null;
    spread += found - from;
    marked[found] = true;
    from = found + 1;
  }
  return { tier: 3, spread, segments: indexSegments(title, marked) };
}
