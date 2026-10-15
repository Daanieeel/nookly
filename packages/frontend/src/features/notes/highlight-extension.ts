import { getMarkRange, InputRule, Mark, markPasteRule, mergeAttributes } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { Mark as PMMark } from "@tiptap/pm/model";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  type HighlightColorId,
  parseHighlightColor,
} from "./highlight-colors";

/// The second `=` of `==`, typed after a first one that is not part of a longer run.
const TYPED_MARKER = /(?:^|[^=])==$/;
/// `==text==`, with no space just inside either pair.
const PASTE = /(?:^|\s)(==(?!\s)([^=]+?)(?<!\s)==)/g;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlight: {
      /// Highlights the selection, or takes the highlight off when all of it has one.
      toggleHighlight: () => ReturnType;
      /// Sets the colour of the highlight around the caret (or of the one about to be typed).
      setHighlightColor: (color: HighlightColorId) => ReturnType;
    };
  }
}

/// The highlight the caret is in, or null. Right before the first character of a highlight is
/// in it too, as far as the person looking at the caret can tell, even though what is typed
/// there is plain; a caret that has stepped out of the highlight is not.
export function highlightAtCaret(state: EditorState): PMMark | null {
  const type = state.schema.marks.highlight;
  if (!type) return null;
  const { selection, storedMarks } = state;
  if (!selection.empty) {
    let found: PMMark | null = null;
    state.doc.nodesBetween(selection.from, selection.to, (node) => {
      found ??= node.marks.find((m) => m.type === type) ?? null;
    });
    return state.doc.rangeHasMark(selection.from, selection.to, type) ? found : null;
  }
  const { $from } = selection;
  const marks = storedMarks ?? $from.marks();
  const inside = marks.find((m) => m.type === type);
  if (inside) return inside;
  if (storedMarks) return null;
  return $from.nodeAfter?.marks.find((m) => m.type === type) ?? null;
}

/// The whole highlight around the caret: before its first character, inside it or after its end.
function highlightRangeAtCaret(state: EditorState): { from: number; to: number } | null {
  const type = state.schema.marks.highlight;
  const { $from } = state.selection;
  if (!type) return null;
  if ($from.nodeAfter?.marks.some((m) => m.type === type)) {
    return getMarkRange(state.doc.resolve($from.pos + 1), type) ?? null;
  }
  return getMarkRange($from, type) ?? null;
}

/// Marker style highlight, stored in the page as `==text==`, or `=={green}text==` for a colour
/// (`block-markdown.ts`; a markdown export drops the colour). It works with the other inline
/// marks. Typing `==` starts one, hiding the markers, and typing `==` inside it, or pressing the
/// right arrow at its edge, ends it (see `inline-mark-cleanup.ts`).
export const Highlight = Mark.create({
  name: "highlight",

  // For the editors that read and write real markdown (`@tiptap/markdown`); the page
  // editor stores its text through `block-markdown.ts` and never uses these.
  markdownTokenName: "highlight",
  markdownTokenizer: {
    name: "highlight",
    level: "inline",
    start: (src: string) => src.indexOf("=="),
    tokenize: (src, _tokens, helpers) => {
      const match = /^==(?!\s)(.+?)(?<!\s)==/.exec(src);
      if (!match) return undefined;
      return {
        type: "highlight",
        raw: match[0],
        text: match[1],
        tokens: helpers.inlineTokens(match[1] ?? ""),
      };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.applyMark("highlight", helpers.parseInline(token.tokens ?? [])),
  renderMarkdown: (node, helpers) => `==${helpers.renderChildren(node)}==`,

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseHighlightColor(element.getAttribute("data-color")),
        renderHTML: (attributes: { color?: string | null }) =>
          attributes.color ? { "data-color": attributes.color } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      setHighlightColor:
        (color) =>
        ({ state, tr, dispatch }) => {
          const type = this.type;
          const mark = type.create({
            color: color === DEFAULT_HIGHLIGHT_COLOR ? null : color,
          });
          const { $from, empty } = state.selection;
          if (!highlightAtCaret(state)) return false;
          const range = empty ? highlightRangeAtCaret(state) : state.selection;
          if (range) {
            if (dispatch) tr.addMark(range.from, range.to, mark);
            return true;
          }
          // Started, and nothing typed in it yet: the colour is for the text to come.
          const active = state.storedMarks ?? $from.marks();
          if (dispatch) tr.setStoredMarks([...active.filter((m) => m.type !== type), mark]);
          return true;
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-h": () => this.editor.commands.toggleHighlight(),
    };
  },
  addInputRules() {
    return [
      // `==` is the marker: typed outside a highlight it starts one, typed inside it ends it.
      // Neither leaves the two characters in the text.
      new InputRule({
        find: TYPED_MARKER,
        handler: ({ state, range }) => {
          const { tr } = state;
          const active = state.storedMarks ?? state.selection.$from.marks();
          const inside = active.some((m) => m.type === this.type);
          // The second `=` is already in the text when the rule runs, so both go.
          tr.delete(range.to - 2, range.to);
          if (inside) tr.setStoredMarks(active.filter((m) => m.type !== this.type));
          else tr.setStoredMarks([...active, this.type.create()]);
        },
      }),
    ];
  },
  addPasteRules() {
    return [markPasteRule({ find: PASTE, type: this.type })];
  },
});
