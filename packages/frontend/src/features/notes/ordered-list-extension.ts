import { OrderedList } from "@tiptap/extension-list";
import { wrappingInputRule } from "@tiptap/react";

/// Typing `a.` or `a)` (either case) at the start of a line starts a numbered
/// list, like `1.` does. The list is an ordinary one, so it saves and shows as
/// 1, 2, 3.
const letterListRule = /^[aA][.)]\s$/;

export const LetterOrderedList = OrderedList.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      wrappingInputRule({ find: letterListRule, type: this.type, getAttributes: { start: 1 } }),
    ];
  },
});
