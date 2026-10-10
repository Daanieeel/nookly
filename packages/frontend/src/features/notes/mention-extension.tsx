import { PluginKey } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { Entity, SessionOccurrence } from "#/lib/api/types.ts";
import { compareKeys, matchesKey } from "#/lib/entity-key.ts";
import { sessionMatches, sessionWhen } from "#/lib/session-search.ts";
import { displayTitle, pluralLabel } from "#/lib/entity-title.ts";
import type { SuggestionListItem } from "./suggestion-list";
import { allowOutsideCode, createSuggestionRender } from "./suggestion-render";

export interface MentionOptions {
  /// Read live so the popup always sees the Space's current entities without
  /// re-registering the extension on every fetch (§ notes rewrite).
  getEntities: () => Entity[];
  /// Whether a File is shown page by page, so a mention of it can name a page.
  hasPages: (entity: Entity) => boolean;
  /// The occurrence behind a session, so one is found by its day and time, not only by its
  /// title (which is just its course).
  sessionOf: (entity: Entity) => SessionOccurrence | undefined;
}

/// A page number for a file, typed after the search: `report#12`.
const PAGE_QUERY = /^(.*?)#(\d+)$/;

/// Splits what was typed after `@` into the words to search for and the page of a file
/// it asks for (`report#12`). A `#` without digits is still being typed and is ignored.
export interface MentionQuery {
  search: string;
  page: number | null;
}

export function parseMentionQuery(query: string): MentionQuery {
  const match = PAGE_QUERY.exec(query);
  if (match) return { search: match[1] ?? "", page: Number(match[2]) };
  return { search: query.replace(/#\D*$/, ""), page: null };
}

export function insertMention(
  editor: Editor,
  range: Range,
  entity: Entity,
  page: number | null = null,
) {
  // Only a file has pages; the number is dropped for anything else.
  const target = entity.type === "file" && page ? page : null;
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: "text",
      text: target ? `${displayTitle(entity)} (p. ${target})` : displayTitle(entity),
      marks: [
        { type: "link", attrs: { href: `mention:${entity.id}${target ? `#p${target}` : ""}` } },
      ],
    })
    .insertContent(" ")
    .run();
}

/// What the "@" menu lists: the entity, and the page of it the query asked for.
interface MentionItem {
  entity: Entity;
  page: number | null;
  /// A file with pages, offered before any `#` was typed: its row has a button to start a
  /// page number.
  canAddPage: boolean;
  /// The file has pages, so a page in the query is meant.
  paged: boolean;
  /// Set for a session, which is listed with its day and time.
  session: SessionOccurrence | undefined;
}

function toListItem({ entity, page, canAddPage, paged, session }: MentionItem): SuggestionListItem {
  // The type is the heading it is listed under, so the key is all that needs saying.
  const kind = entity.key;
  const detail = session ? `${sessionWhen(session)} · ${kind}` : kind;
  return {
    key: entity.id,
    icon: <EntityIcon entity={entity} size={14} />,
    label: displayTitle(entity),
    // A page the query asked for shows only on a file, which is all that can take one.
    description: paged && page ? `Page ${page} · ${kind}` : detail,
    group: pluralLabel(entity.type),
    actionLabel: canAddPage ? "# Page" : undefined,
  };
}

/// Shown per type, so one big type cannot push the others out of sight.
const GROUP_CAP = 5;

/// The order the types are listed in before anything is typed.
const TYPE_ORDER = [
  "note",
  "jot",
  "task",
  "course",
  "session",
  "exam",
  "assignment",
  "file",
  "bookmark",
];

/// Items grouped by type, each group adjacent (the list draws a heading per run). With
/// nothing typed the types go in a fixed order; once something is typed the type of the
/// best match comes first.
function groupByType(items: MentionItem[], blank: boolean): MentionItem[] {
  const groups = new Map<string, MentionItem[]>();
  for (const item of items) {
    const group = groups.get(item.entity.type) ?? [];
    if (group.length < GROUP_CAP) groups.set(item.entity.type, [...group, item]);
  }
  const order = (type: string) => {
    const index = TYPE_ORDER.indexOf(type);
    return index === -1 ? TYPE_ORDER.length : index;
  };
  const ordered = [...groups.entries()];
  if (blank) ordered.sort((a, b) => order(a[0]) - order(b[0]));
  return ordered.flatMap(([, group]) => group);
}

/// Entities matching `query`, best first: a title that starts with it, then one that
/// contains it, and only then those matched by their ID (`fil` or `FIL-2` finds files).
/// An ID is never worth more than text.
function rankMentions(
  entities: Entity[],
  query: string,
  sessionOf: (entity: Entity) => SessionOccurrence | undefined,
): Entity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entities;
  const tier = (entity: Entity): number => {
    const title = displayTitle(entity).toLowerCase();
    if (title.startsWith(needle)) return 0;
    if (title.includes(needle)) return 1;
    // A session is also found by its day and time: `tue`, `mar`, `9am`.
    const session = sessionOf(entity);
    if (session && sessionMatches(session, needle)) return 2;
    if (matchesKey(entity.key, query) || entity.key.toLowerCase().startsWith(needle)) return 3;
    return 4;
  };
  return entities
    .map((entity) => ({ entity, rank: tier(entity) }))
    .filter(({ rank }) => rank < 4)
    .toSorted((a, b) => a.rank - b.rank || (a.rank === 3 ? compareKeys(a.entity, b.entity) : 0))
    .map(({ entity }) => entity);
}

/// Typing "@" opens a search over the Space's entities (§5.4) and inserts a real
/// link mark on select — same `mention:<id>` href `mention-utils.ts` already reads
/// out of persisted block content, just rendered as a link instead of raw markdown.
export const Mention = Extension.create<MentionOptions>({
  name: "mention",

  addOptions() {
    return { getEntities: () => [], hasPages: () => false, sessionOf: () => undefined };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionItem>({
        editor: this.editor,
        pluginKey: new PluginKey("mention"),
        char: "@",
        allow: allowOutsideCode,
        items: ({ query }) => {
          const { search, page } = parseMentionQuery(query);
          const ranked = rankMentions(
            this.options.getEntities(),
            search,
            this.options.sessionOf,
          ).map((entity) => {
            const paged = entity.type === "file" && this.options.hasPages(entity);
            return {
              entity,
              // Only a file with pages takes one; the number is dropped for anything else.
              page: paged ? page : null,
              paged,
              canAddPage: paged && !query.includes("#"),
              session: this.options.sessionOf(entity),
            };
          });
          return groupByType(ranked, search.trim() === "");
        },
        command: ({ editor, range, props }) =>
          insertMention(editor, range, props.entity, props.page),
        render: createSuggestionRender(toListItem, {
          footer: (items, query) => {
            if (!items.some((i) => i.paged)) return undefined;
            if (!query.includes("#")) return "Press → to add a page number";
            return parseMentionQuery(query).page === null
              ? "Type the page number, then press Enter"
              : undefined;
          },
          // Starts a page number: the query becomes `report#`, and the digits follow.
          onAction: (_item, props) =>
            void props.editor.chain().focus().insertContentAt(props.range.to, "#").run(),
        }),
      }),
    ];
  },
});
