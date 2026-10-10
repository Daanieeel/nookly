import { PluginKey } from "@tiptap/pm/state";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { type EmojiEntry, searchEmoji, searchSymbols, type SymbolEntry } from "#/lib/emoji.ts";
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

/// Typing ":" followed by a word opens a search over symbols, then emoji, and inserts
/// the chosen character as plain text. The default prefix rule (only after a space or
/// at the start of a block) keeps "12:30" and "https://" from opening it, and it stays
/// closed until at least one letter follows the colon.
export const Emoji = Extension.create({
  name: "emoji",

  addProseMirrorPlugins() {
    return [
      Suggestion<EmojiItem>({
        editor: this.editor,
        pluginKey: new PluginKey("emoji"),
        char: ":",
        allow: (props) => props.range.to - props.range.from > 1 && allowOutsideCode(props),
        items: ({ query }) => [
          ...searchSymbols(query).map((entry): EmojiItem => ({ group: "Symbols", entry })),
          ...searchEmoji(query).map((entry): EmojiItem => ({ group: "Emojis", entry })),
        ],
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).insertContent(charOf(props)).run();
        },
        render: createSuggestionRender(toListItem, { hideWhenEmpty: true }),
      }),
    ];
  },
});
