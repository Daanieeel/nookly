import { OrderedList } from "@tiptap/extension-list";
import { wrappingInputRule } from "@tiptap/react";

/// Typing `a.` or `a)` (either case) at the start of a line starts a numbered
/// list, like `1.` does. The list remembers what was typed as its `marker` and
/// counts in letters (a, b, c) with that punctuation, instead of becoming 1, 2, 3.
const letterListRule = /^[aA][.)]\s$/;

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
});
