import { foldText, foldWithOrigins } from "#/lib/text-search.ts";

/// Entity types folded into one named group, in the order Pinned and Trash list them.
export const TYPE_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "tasks", label: "Tasks", types: ["task", "sub_task"] },
  { key: "notes", label: "Notes", types: ["note"] },
  { key: "jots", label: "Jots", types: ["jot"] },
  { key: "courses", label: "Courses", types: ["course"] },
  { key: "semesters", label: "Semesters", types: ["semester"] },
  {
    key: "sessions",
    label: "Sessions",
    types: ["session", "session_template"],
  },
  { key: "exams", label: "Exams", types: ["exam"] },
  { key: "decks", label: "Decks", types: ["index_card_deck"] },
  { key: "assignments", label: "Assignments", types: ["assignment"] },
  { key: "files", label: "Files", types: ["file"] },
  { key: "bookmarks", label: "Bookmarks", types: ["bookmark"] },
];

const OTHER_GROUP = { key: "other", label: "Other" };

export function typeGroupFor(type: string): { key: string; label: string } {
  return TYPE_GROUPS.find((g) => g.types.includes(type)) ?? OTHER_GROUP;
}

/// The type tabs of the search palettes after All, in the order Tab cycles them.
/// Types without a tab only show under All.
export const SEARCH_TABS: { key: string; label: string; types: string[] }[] = [
  "notes",
  "tasks",
  "files",
  "jots",
  "bookmarks",
  "assignments",
  "courses",
  "sessions",
].flatMap((key) => TYPE_GROUPS.filter((g) => g.key === key));

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

/// Splits `text` into segments, marking every occurrence of any whitespace separated
/// word in `query`, ignoring case and accents.
export function termSegments(text: string, query: string): TextSegment[] {
  const terms = foldText(query).split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return [{ text, match: false }];
  const { folded, origins } = foldWithOrigins(text);
  const marked = Array.from({ length: text.length }, () => false);
  for (const term of terms) {
    let from = folded.indexOf(term);
    while (from !== -1) {
      markFolded(marked, origins, text.length, from, from + term.length);
      from = folded.indexOf(term, from + term.length);
    }
  }
  return indexSegments(text, marked);
}

/// Marks the characters of the original text behind folded characters `from` up to
/// `to`, including any combining marks that follow the last one.
function markFolded(
  marked: boolean[],
  origins: number[],
  length: number,
  from: number,
  to: number,
) {
  marked.fill(true, origins[from], to < origins.length ? origins[to] : length);
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
