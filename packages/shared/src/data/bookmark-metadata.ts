/// What a bookmark card shows, read from a page's `<head>`: the port of the desktop's
/// `page_metadata` (`commands/bookmarks.rs`), with its own tests' pages.

export interface PageMetadata {
  title: string | null;
  description: string | null;
  previewImageUrl: string | null;
  faviconUrl: string | null;
}

const NAMED = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["rsquo", "\u2019"],
  ["lsquo", "\u2018"],
  ["rdquo", "\u201d"],
  ["ldquo", "\u201c"],
  ["ndash", "\u2013"],
  ["mdash", "\u2014"],
  ["hellip", "\u2026"],
]);

/// The named entities pages commonly use in titles and descriptions, plus any numeric one.
export function htmlUnescape(text: string): string {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (!entity.startsWith("#")) return NAMED.get(entity) ?? whole;
    const code = /^#[xX]/.test(entity)
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    if (!Number.isFinite(code) || code > 0x10ffff) return whole;
    return String.fromCodePoint(code);
  });
}

type Attrs = Map<string, string>;

/// Every `<name ...>` tag's attributes, lowercased names. Handles double, single and unquoted
/// values (minified pages drop the quotes) in any order.
function tags(html: string, name: string): Attrs[] {
  const attr = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const tag = new RegExp(`<${name}\\b([^>]*)>`, "gis");
  return [...html.matchAll(tag)].map((match) => {
    const attrs: Attrs = new Map();
    for (const a of match[1].matchAll(attr)) {
      attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
    }
    return attrs;
  });
}

function resolveUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

/// The page's icon, preferring a real icon near the 32 px it is shown at, then Apple touch
/// icons, then `/favicon.ico` as a last guess.
function favicon(html: string, base: string): string | null {
  let best: { rank: [number, number]; href: string } | null = null;
  for (const attrs of tags(html, "link")) {
    const rel = attrs.get("rel")?.toLowerCase();
    const href = attrs.get("href");
    if (!rel || !href) continue;
    const kind = rel.split(/\s+/).includes("icon")
      ? 0
      : rel.startsWith("apple-touch-icon")
        ? 1
        : null;
    if (kind === null) continue;
    // Distance from 32 px; unknown sizes rank like a 64 px icon.
    const px = Number.parseInt((attrs.get("sizes") ?? "").split(/x/i)[0], 10);
    const size = Number.isFinite(px) ? Math.abs(px - 32) : 32;
    const rank: [number, number] = [kind, size];
    if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1])) {
      best = { rank, href };
    }
  }
  if (best) return resolveUrl(base, best.href);
  try {
    const parsed = new URL(base);
    return `${parsed.protocol}//${parsed.host}/favicon.ico`;
  } catch {
    return null;
  }
}

/// GitHub serves its own repo social preview at a well known URL, so a repo page's own scraped
/// image is skipped in favor of it.
function githubPreview(base: string): string | null {
  try {
    const parsed = new URL(base);
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    return owner && repo ? `https://opengraph.githubassets.com/1/${owner}/${repo}` : null;
  } catch {
    return null;
  }
}

export function pageMetadata(html: string, base: string): PageMetadata {
  const metas = tags(html, "meta");
  const meta = (names: string[]): string | null => {
    for (const name of names) {
      for (const attrs of metas) {
        const key = attrs.get("property") ?? attrs.get("name");
        const content = attrs.get("content");
        if (key && content && key.toLowerCase() === name) {
          const value = htmlUnescape(content.trim());
          if (value) return value;
        }
      }
    }
    return null;
  };
  const title =
    meta(["og:title", "twitter:title"]) ??
    (() => {
      const found = /<title[^>]*>(.*?)<\/title>/is.exec(html);
      const text = found ? htmlUnescape(found[1].trim()) : "";
      return text || null;
    })();
  const image = meta(["og:image", "og:image:url", "twitter:image"]);
  return {
    title,
    description: meta(["description", "og:description", "twitter:description"]),
    previewImageUrl: githubPreview(base) ?? (image ? resolveUrl(base, image) : null),
    faviconUrl: favicon(html, base),
  };
}

/// Plain, keyword-searchable text of a page, without scripts, styles and tags, capped.
export function pageText(html: string): string {
  const stripped = html
    .replace(/<script\b[^>]*>.*?<\/script>/gis, " ")
    .replace(/<style\b[^>]*>.*?<\/style>/gis, " ")
    .replace(/<[^>]+>/gs, " ")
    .replace(/\s+/g, " ")
    .trim();
  return htmlUnescape(stripped).slice(0, 20_000);
}
