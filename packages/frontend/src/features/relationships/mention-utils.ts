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
}

const MENTION_HREF_PREFIX = "mention:";

const PAGE_FRAGMENT = /^p(\d+)$/;

/// Reads a `mention:` href, or `null` for any other link. A fragment that is `p` and
/// digits only is a page; every real block id has other characters.
export function parseMentionHref(href: string): MentionTarget | null {
  if (!href.startsWith(MENTION_HREF_PREFIX)) return null;
  const [entityId, fragment] = href.slice(MENTION_HREF_PREFIX.length).split("#");
  if (!entityId) return null;
  if (!fragment) return { entityId };
  const page = PAGE_FRAGMENT.exec(fragment)?.[1];
  return page ? { entityId, page: Number(page) } : { entityId, blockId: fragment };
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
