import { PluginKey } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { EntityIcon } from "@/components/entity-icon";
import type { Entity } from "@/lib/api/types";
import type { SuggestionListItem } from "./suggestion-list";
import { createSuggestionRender } from "./suggestion-render";

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
      text: entity.title,
      marks: [{ type: "link", attrs: { href: `mention:${entity.id}` } }],
    })
    .insertContent(" ")
    .run();
}

function toListItem(entity: Entity): SuggestionListItem {
  return {
    key: entity.id,
    icon: <EntityIcon entity={entity} size={14} />,
    label: entity.title,
    description: entity.type,
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
        items: ({ query }) =>
          this.options
            .getEntities()
            .filter((e) => e.title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8),
        command: ({ editor, range, props }) => insertMention(editor, range, props),
        render: createSuggestionRender(toListItem),
      }),
    ];
  },
});
