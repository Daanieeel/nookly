import { renderNestedMarkdownContent } from "@tiptap/core";
import { getListMarker, ListItem, OrderedList } from "@tiptap/extension-list";
import { wrappingInputRule } from "@tiptap/react";
import { asNumber, asString, type JSONAttrValue } from "./block-markdown";

/// Typing `a.` or `a)` (either case) at the start of a line starts a numbered
/// list, like `1.` does. The list remembers what was typed as its `marker` and
/// counts in letters (a, b, c) with that punctuation, instead of becoming 1, 2, 3.
const letterListRule = /^[aA][.)]\s$/;

/// The first line of a markdown list that starts at `a` or `A`, with its punctuation.
const letterListStart = /^\s*([aA])([.)])\s/;

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
        getAttributes: (match) => ({ start: 1, marker: match[0].trim() }),
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
    return { ...parsed, attrs: { ...attrs, marker: `${start[1]}${start[2]}` } };
  },
});

/// A list item that writes its marker the way its list shows it, so a lettered list saves
/// as `a)` or `A.` in markdown and not as numbers.
export const MarkerListItem = ListItem.extend({
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
