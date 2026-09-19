/// Mentions (§1.5) are plain markdown links with a `mention:` URL scheme — no custom
/// syntax to special-case on export (§8), since a markdown renderer already handles them.
const MENTION_PATTERN = /\[([^\]]+)\]\(mention:([a-zA-Z0-9-]+)\)/g;

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
