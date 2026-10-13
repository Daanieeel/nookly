import { getMarkRange, InputRule, Mark, markPasteRule, mergeAttributes } from "@tiptap/core";
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
          const range = empty ? getMarkRange($from, type) : null;
          if (range) {
            if (dispatch) tr.addMark(range.from, range.to, mark);
            return true;
          }
          const active = state.storedMarks ?? $from.marks();
          if (!empty || !active.some((m) => m.type === type)) return false;
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
          tr.delete(range.to - 1, range.to);
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
