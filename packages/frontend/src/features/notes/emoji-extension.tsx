import { PluginKey } from "@tiptap/pm/state";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
  type EmojiEntry,
  featuredEmoji,
  featuredSymbols,
  searchEmoji,
  searchSymbols,
  type SymbolEntry,
} from "#/lib/emoji.ts";
import type { SuggestionListItem } from "./suggestion-list";
import { allowOutsideCode, createSuggestionRender } from "./suggestion-render";

type EmojiItem = { group: "Symbols"; entry: SymbolEntry } | { group: "Emojis"; entry: EmojiEntry };

function charOf(item: EmojiItem): string {
  return item.group === "Symbols" ? item.entry.char : item.entry.emoji;
}

function toListItem(item: EmojiItem): SuggestionListItem {
  const char = charOf(item);
  return {
    key: `${item.group}:${char}:${item.entry.name}`,
    icon: <span className="text-base/none">{char}</span>,
    label: item.entry.name,
    group: item.group,
  };
}

/// Typing ":" opens a list of symbols, then emoji, to pick from, and the words that
/// follow search them; the chosen character goes in as plain text. The default prefix
/// rule (only after a space or at the start of a block) keeps "12:30" and "https://"
/// from opening it. It closes again when what follows the colon matches nothing.
export const Emoji = Extension.create({
  name: "emoji",

  addProseMirrorPlugins() {
    return [
      Suggestion<EmojiItem>({
        editor: this.editor,
        pluginKey: new PluginKey("emoji"),
        char: ":",
        allow: allowOutsideCode,
        items: ({ query }) => {
          const blank = query.trim() === "";
          return [
            ...(blank ? featuredSymbols() : searchSymbols(query)).map((entry): EmojiItem => ({
              group: "Symbols",
              entry,
            })),
            ...(blank ? featuredEmoji() : searchEmoji(query)).map((entry): EmojiItem => ({
              group: "Emojis",
              entry,
            })),
          ];
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).insertContent(charOf(props)).run();
        },
        render: createSuggestionRender(toListItem, { hideWhenEmpty: true }),
      }),
    ];
  },
});
