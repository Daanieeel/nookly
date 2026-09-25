import { PluginKey } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { matchesTitleOrKey } from "#/lib/entity-key.ts";
import { displayTitle, labelForType } from "#/lib/entity-title.ts";
import type { SuggestionListItem } from "./suggestion-list";
import { allowOutsideCode, createSuggestionRender } from "./suggestion-render";

export interface MentionOptions {
  /// Read live so the popup always sees the Space's current entities without
  /// re-registering the extension on every fetch (§ notes rewrite).
  getEntities: () => Entity[];
}

function insertMention(editor: Editor, range: Range, entity: Entity) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: "text",
      text: displayTitle(entity),
      marks: [{ type: "link", attrs: { href: `mention:${entity.id}` } }],
    })
    .insertContent(" ")
    .run();
}

function toListItem(entity: Entity): SuggestionListItem {
  return {
    key: entity.id,
    icon: <EntityIcon entity={entity} size={14} />,
    label: displayTitle(entity),
    description: `${entity.key} · ${labelForType(entity.type)}`,
  };
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
      Suggestion<Entity>({
        editor: this.editor,
        pluginKey: new PluginKey("mention"),
        char: "@",
        allow: allowOutsideCode,
        items: ({ query }) =>
          this.options
            .getEntities()
            .filter((e) => matchesTitleOrKey(e, query, displayTitle(e)))
            .slice(0, 8),
        command: ({ editor, range, props }) => insertMention(editor, range, props),
        render: createSuggestionRender(toListItem),
      }),
    ];
  },
});
