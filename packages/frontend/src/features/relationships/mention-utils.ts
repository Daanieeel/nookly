/// Mentions (§1.5) are plain markdown links with a `mention:` URL scheme — no custom
/// syntax to special-case on export (§8), since a markdown renderer already handles them.
/// A `#<blockId>` suffix links one block of the page (§ block-level addressing).
const MENTION_PATTERN = /\[([^\]]+)\]\(mention:([a-zA-Z0-9-]+)(?:#[a-zA-Z0-9_-]+)?\)/g;

/// What a `mention:` link points at: a whole entity, one block of a page (`#<blockId>`) or
/// one page of a file (`#p12`).
export interface MentionTarget {
  entityId: string;
  blockId?: string;
  page?: number;
  /// A row (counted from 1, the header being row 1) of the table `blockId` is.
  row?: number;
  /// A column (counted from 1) of the table `blockId` is.
  column?: number;
  /// A piece of text of the block `blockId`, which is marked once the block is shown.
  quote?: string;
}

const MENTION_HREF_PREFIX = "mention:";

const PAGE_FRAGMENT = /^p(\d+)$/;

/// A block followed by `_r3` or `_c2`: a row or column of that table.
const TABLE_PART_FRAGMENT = /^([A-Za-z0-9-][A-Za-z0-9_-]*)_([rc])(\d+)$/;

/// A block followed by `_q` and some text, in a form a fragment may hold (`quoteFragment`).
/// Tried before a row or column, since the text itself may end like one.
const QUOTE_FRAGMENT = /^([A-Za-z0-9-]+)_q([A-Za-z0-9_-]+)$/;

/// The longest piece of text a link keeps. The start of a longer selection is marked.
export const MAX_QUOTE_CHARS = 120;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/// The text in a quote fragment, or `null` when it is not text.
function fromBase64Url(encoded: string): string | null {
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

/// The fragment that points at a piece of text in a block: the block, then the text itself
/// (not where it is, which a later edit would move). Opening it finds the text again.
export function quoteFragment(blockId: string, quote: string): string {
  const kept = Array.from(quote).slice(0, MAX_QUOTE_CHARS).join("");
  return `${blockId}_q${toBase64Url(kept)}`;
}

/// The fragment that points at a row or column of a table block.
export function tablePartFragment(blockId: string, part: "row" | "column", index: number): string {
  return `${blockId}_${part === "row" ? "r" : "c"}${index}`;
}

/// Reads a `mention:` href, or `null` for any other link. A fragment that is `p` and
/// digits only is a page; every real block id has other characters.
export function parseMentionHref(href: string): MentionTarget | null {
  if (!href.startsWith(MENTION_HREF_PREFIX)) return null;
  const [entityId, fragment] = href.slice(MENTION_HREF_PREFIX.length).split("#");
  if (!entityId) return null;
  if (!fragment) return { entityId };
  const page = PAGE_FRAGMENT.exec(fragment)?.[1];
  if (page) return { entityId, page: Number(page) };
  const quoted = QUOTE_FRAGMENT.exec(fragment);
  if (quoted) {
    // Text that cannot be read still points at its block.
    const quote = fromBase64Url(quoted[2]);
    return quote === null
      ? { entityId, blockId: quoted[1] }
      : { entityId, blockId: quoted[1], quote };
  }
  const part = TABLE_PART_FRAGMENT.exec(fragment);
  if (part) {
    const [, blockId, kind, index] = part;
    return kind === "r"
      ? { entityId, blockId, row: Number(index) }
      : { entityId, blockId, column: Number(index) };
  }
  return { entityId, blockId: fragment };
}

const ENTITY_KEY = /^[A-Za-z]{3}-\d+$/;

/// Whether a mention's target is a readable key (`JOT-12`) rather than an id. Ids are
/// stored, keys are what people see and write; both open the same page.
export function isEntityKey(target: string): boolean {
  return ENTITY_KEY.test(target);
}

export function extractMentionIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    ids.add(match[2]);
  }
  return [...ids];
}

export function mentionMarkdown(title: string, entityId: string): string {
  return `[${title}](mention:${entityId})`;
}
