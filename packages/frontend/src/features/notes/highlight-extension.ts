import { Mark, markInputRule, markPasteRule, mergeAttributes } from "@tiptap/core";

/// `==text==`, with no space just inside either pair.
const INPUT = /(?:^|\s)(==(?!\s)([^=]+?)(?<!\s)==)$/;
const PASTE = /(?:^|\s)(==(?!\s)([^=]+?)(?<!\s)==)/g;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlight: {
      /// Highlights the selection, or takes the highlight off when all of it has one.
      toggleHighlight: () => ReturnType;
    };
  }
}

/// Marker style highlight, stored in the page as `==text==` (`block-markdown.ts`). It works
/// with the other inline marks, and typing `==text==` makes it, the way `**bold**` makes bold.
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
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleHighlight() };
  },
  addInputRules() {
    return [markInputRule({ find: INPUT, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: PASTE, type: this.type })];
  },
});
