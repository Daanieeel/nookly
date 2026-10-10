import { PluginKey } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { compareKeys, matchesKey } from "#/lib/entity-key.ts";
import { displayTitle, labelForType } from "#/lib/entity-title.ts";
import type { SuggestionListItem } from "./suggestion-list";
import { allowOutsideCode, createSuggestionRender } from "./suggestion-render";

export interface MentionOptions {
  /// Read live so the popup always sees the Space's current entities without
  /// re-registering the extension on every fetch (§ notes rewrite).
  getEntities: () => Entity[];
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
}

function toListItem({ entity }: MentionItem): SuggestionListItem {
  return {
    key: entity.id,
    icon: <EntityIcon entity={entity} size={14} />,
    label: displayTitle(entity),
    description: `${entity.key} · ${labelForType(entity.type)}`,
  };
}

/// Entities matching `query`, best first: a title that starts with it, then one that
/// contains it, and only then those matched by their ID (`fil` or `FIL-2` finds files).
/// An ID is never worth more than text.
function rankMentions(entities: Entity[], query: string): Entity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entities;
  const tier = (entity: Entity): number => {
    const title = displayTitle(entity).toLowerCase();
    if (title.startsWith(needle)) return 0;
    if (title.includes(needle)) return 1;
    if (matchesKey(entity.key, query) || entity.key.toLowerCase().startsWith(needle)) return 2;
    return 3;
  };
  return entities
    .map((entity) => ({ entity, rank: tier(entity) }))
    .filter(({ rank }) => rank < 3)
    .toSorted((a, b) => a.rank - b.rank || (a.rank === 2 ? compareKeys(a.entity, b.entity) : 0))
    .map(({ entity }) => entity);
}

/// Typing "@" opens a search over the Space's entities (§5.4) and inserts a real
/// link mark on select — same `mention:<id>` href `mention-utils.ts` already reads
/// out of persisted block content, just rendered as a link instead of raw markdown.
export const Mention = Extension.create<MentionOptions>({
  name: "mention",

  addOptions() {
    return { getEntities: () => [] };
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
          return rankMentions(this.options.getEntities(), search)
            .slice(0, 8)
            .map((entity) => ({ entity, page }));
        },
        command: ({ editor, range, props }) =>
          insertMention(editor, range, props.entity, props.page),
        render: createSuggestionRender(toListItem, {
          footer: (items, query) =>
            items.some((i) => i.entity.type === "file") && !query.includes("#")
              ? "Add a page number: type #12"
              : undefined,
        }),
      }),
    ];
  },
});
