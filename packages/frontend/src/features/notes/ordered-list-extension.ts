import { type Editor, renderNestedMarkdownContent } from "@tiptap/core";
import { getListMarker, ListItem, OrderedList } from "@tiptap/extension-list";
import { wrappingInputRule } from "@tiptap/react";
import { asNumber, asString, type JSONAttrValue } from "./block-markdown";

/// Typing a letter and `.` or `)` (either case) at the start of a line starts a numbered
/// list, like `1.` does, and it starts at that letter: `b)` begins at b. The list remembers
/// the case and punctuation as its `marker` and counts in letters (a, b, c) with it, instead
/// of becoming 1, 2, 3.
const letterListRule = /^[a-zA-Z][.)]\s$/;

/// The first line of a markdown list that starts at a letter, with its punctuation.
const letterListStart = /^\s*([a-zA-Z])([.)])\s/;

/// Where a list that starts at `letter` begins counting: a is 1, b is 2.
function letterNumber(letter: string): number {
  return letter.toLowerCase().charCodeAt(0) - 96;
}

/// The marker a list that starts at `letter` keeps, which is its first letter in the same case.
function markerOf(letter: string, punctuation: string): string {
  return `${letter === letter.toUpperCase() ? "A" : "a"}${punctuation}`;
}

type Attrs = Record<string, JSONAttrValue>;

export const LetterOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-marker"),
        renderHTML: (attributes) => (attributes.marker ? { "data-marker": attributes.marker } : {}),
      },
    };
  },
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      wrappingInputRule({
        find: letterListRule,
        type: this.type,
        getAttributes: (match) => {
          const typed = match[0].trim();
          return {
            start: letterNumber(typed.charAt(0)),
            marker: markerOf(typed.charAt(0), typed.charAt(1)),
          };
        },
      }),
    ];
  },
  // Markdown already reads `a.` and `a)` as a lettered list but forgets the `)`, so the
  // marker is taken from the source line to keep it.
  parseMarkdown: (token, helpers) => {
    const parsed = OrderedList.config.parseMarkdown?.(token, helpers) ?? [];
    const start = letterListStart.exec(token.raw ?? "");
    if (!start || Array.isArray(parsed) || !("type" in parsed) || parsed.type !== "orderedList") {
      return parsed;
    }
    const { type: _type, ...attrs } = parsed.attrs ?? {};
    const letter = start[1] ?? "a";
    const marker = markerOf(letter, start[2] ?? ".");
    return { ...parsed, attrs: { ...attrs, marker, start: letterNumber(letter) } };
  },
});

/// Indenting an item of a numbered list starts a nested list that counts like the one it
/// came from and begins at the label the item had: `b.` stays `b.`, `2.` stays `2.`. Left to
/// the default, the nested list would restart as `1.` and lose its letters.
function sinkKeepingLabel(editor: Editor, name: string): boolean {
  const { $from } = editor.state.selection;
  let item = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) {
      item = depth;
      break;
    }
  }
  const list = item > 0 ? $from.node(item - 1) : null;
  if (!list || list.type.name !== "orderedList") return editor.commands.sinkListItem(name);
  const label = (asNumber(list.attrs.start) ?? 1) + $from.index(item - 1) - 1;
  const marker = asString(list.attrs.marker) ?? null;
  return editor
    .chain()
    .sinkListItem(name)
    .command(({ tr }) => {
      // The list the item went into is the one around the caret now; a new one has just this item.
      const { $from: now } = tr.selection;
      for (let depth = now.depth; depth > 0; depth--) {
        const nested = now.node(depth);
        if (nested.type.name !== "orderedList") continue;
        if (nested.childCount === 1 && nested !== list) {
          tr.setNodeMarkup(now.before(depth), undefined, {
            ...nested.attrs,
            marker,
            start: label + 1,
          });
        }
        break;
      }
      return true;
    })
    .run();
}

/// A list item that writes its marker the way its list shows it, so a lettered list saves
/// as `a)` or `A.` in markdown and not as numbers.
export const MarkerListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => sinkKeepingLabel(this.editor, this.name),
    };
  },
  renderMarkdown: (node, h, ctx) =>
    renderNestedMarkdownContent(
      node,
      h,
      (context: { parentType?: string; index?: number; meta?: { parentAttrs?: Attrs } }) => {
        if (context.parentType !== "orderedList") return "- ";
        const attrs = context.meta?.parentAttrs ?? {};
        const index = (asNumber(attrs.start) ?? 1) - 1 + (context.index ?? 0);
        const marker = asString(attrs.marker);
        if (marker) return getListMarker(marker.charAt(0), index, `${marker.charAt(1)} `);
        return getListMarker(asString(attrs.type), index, ". ");
      },
      ctx,
      { alignNestedToPrefix: ctx?.parentType === "orderedList" },
    ),
});

/// Every editor with a numbered list needs both, with the starter kit's own turned off.
export const letterListExtensions = [LetterOrderedList, MarkerListItem];
