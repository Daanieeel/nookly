import { z } from "zod";

/// What the media, link and card blocks ask of the phone, across the editor's bridge as JSON: a
/// search of the phone's items, a file from the phone's Files, a link saved as a Bookmark.

export const blockRequest = z.discriminatedUnion("op", [
  /// Items by what was typed, of the given types (any when none).
  z.object({ op: z.literal("search"), query: z.string(), types: z.array(z.string()) }),
  /// A file the person picks, kept in the page's Space.
  z.object({ op: z.literal("upload") }),
  /// A link kept as a Bookmark in the page's Space.
  z.object({ op: z.literal("bookmark"), url: z.string() }),
]);
export type BlockRequest = z.infer<typeof blockRequest>;

export const foundItems = z.array(z.object({ id: z.string(), title: z.string(), key: z.string() }));
export type FoundItem = z.infer<typeof foundItems>[number];

/// What a block takes in place of its contents: a mention of the item, or why not.
export const blockAnswer = z.union([
  z.object({ rows: z.string() }),
  z.object({ error: z.string() }),
  z.object({ canceled: z.literal(true) }),
]);

/// A mention of an item as a block keeps it, the way every client writes one.
export function mentionRows(title: string, id: string): string {
  const label = title.replace(/[[\]]/g, " ").trim() || "Untitled";
  return `[${label}](mention:${id})`;
}

const MENTION = /^\[([^\]]*)\]\(mention:([a-zA-Z0-9-]+)\)$/;

/// What a media or card block holds: a mention of an item, a link, or nothing (or something
/// the phone can't use, such as a path on a computer).
export type Held =
  | { kind: "empty" }
  | { kind: "mention"; label: string; id: string }
  | { kind: "url"; url: string }
  | { kind: "other"; text: string };

export function heldBy(rows: string): Held {
  const value = rows.trim();
  if (!value) return { kind: "empty" };
  const mention = MENTION.exec(value);
  if (mention) return { kind: "mention", label: mention[1], id: mention[2] };
  if (/^https?:\/\/\S+$/.test(value)) return { kind: "url", url: value };
  return { kind: "other", text: value };
}

export const isLink = (text: string) => /^https?:\/\/\S+$/.test(text.trim());
