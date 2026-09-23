import { findChildren } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { HighlighterCore, ThemedToken } from "@shikijs/core";
import { CodeBlockComponent } from "./CodeBlockComponent";
import { getShikiHighlighter, SHIKI_THEME_NAME } from "./shiki-highlighter";

/// Standard TextMate/VS Code bitmask values (`vscode-textmate`'s own `FontStyle` enum, defined
/// locally rather than imported since that package only exports it as a type, not a runtime
/// value) — a token's `fontStyle` ORs these together.
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

function decorationStyle(token: ThemedToken): string | null {
  if (!token.color) return null;
  let style = `color:${token.color}`;
  if (token.fontStyle) {
    if (token.fontStyle & FONT_STYLE_ITALIC) style += ";font-style:italic";
    if (token.fontStyle & FONT_STYLE_BOLD) style += ";font-weight:700";
    if (token.fontStyle & FONT_STYLE_UNDERLINE) style += ";text-decoration:underline";
  }
  return style;
}

function getDecorations({
  doc,
  name,
  defaultLanguage,
  highlighter,
}: {
  doc: ProseMirrorNode;
  name: string;
  defaultLanguage: string;
  highlighter: HighlighterCore | null;
}): DecorationSet {
  const decorations: Decoration[] = [];
  if (highlighter) {
    const loadedLanguages = new Set(highlighter.getLoadedLanguages());
    findChildren(doc, (node) => node.type.name === name).forEach((block) => {
      const from = block.pos + 1;
      const code = block.node.textContent;
      const language: string = block.node.attrs.language || defaultLanguage;
      if (!code || !loadedLanguages.has(language)) return;
      const lines = highlighter.codeToTokensBase(code, { lang: language, theme: SHIKI_THEME_NAME });
      for (const line of lines) {
        for (const token of line) {
          const style = decorationStyle(token);
          if (!style) continue;
          decorations.push(
            Decoration.inline(from + token.offset, from + token.offset + token.content.length, {
              style,
            }),
          );
        }
      }
    });
  }
  return DecorationSet.create(doc, decorations);
}

/// Mirrors `@tiptap/extension-code-block-lowlight`'s own decoration plugin (recompute on any
/// transaction that touches a code block's text or count, otherwise just remap the existing set)
/// — see its `src/lowlight-plugin.ts` — with Shiki's tokenizer standing in for lowlight's, plus
/// one addition: `view()` kicks off loading the (async-to-build, sync-to-use) highlighter singleton
/// and forces a one-time recompute via a tagged empty transaction once it resolves, since the
/// first code block can otherwise mount before the highlighter is ready.
function ShikiHighlightPlugin({
  name,
  defaultLanguage,
}: {
  name: string;
  defaultLanguage: string;
}) {
  const key = new PluginKey<DecorationSet>("shikiHighlight");
  let highlighter: HighlighterCore | null = null;

  return new Plugin({
    key,
    state: {
      init: (_, { doc }) => getDecorations({ doc, name, defaultLanguage, highlighter }),
      apply(transaction, decorationSet, oldState, newState) {
        if (transaction.getMeta(key) === "ready") {
          return getDecorations({ doc: transaction.doc, name, defaultLanguage, highlighter });
        }
        const oldNodeName = oldState.selection.$head.parent.type.name;
        const newNodeName = newState.selection.$head.parent.type.name;
        const oldNodes = findChildren(oldState.doc, (node) => node.type.name === name);
        const newNodes = findChildren(newState.doc, (node) => node.type.name === name);
        const touchesCodeBlock =
          transaction.docChanged &&
          ([oldNodeName, newNodeName].includes(name) ||
            newNodes.length !== oldNodes.length ||
            transaction.steps.some((step) => {
              // SAFETY: only replace-like steps (the only ones that can change a code block's
              // text) carry numeric `from`/`to` — this narrows the `Step` union down to that
              // shape before reading them.
              const range = step as { from?: number; to?: number };
              const { from, to } = range;
              if (from === undefined || to === undefined) return false;
              return oldNodes.some(
                (node) => node.pos >= from && node.pos + node.node.nodeSize <= to,
              );
            }));
        if (touchesCodeBlock) {
          return getDecorations({ doc: transaction.doc, name, defaultLanguage, highlighter });
        }
        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state);
      },
    },
    view(editorView) {
      let cancelled = false;
      getShikiHighlighter().then((loaded) => {
        if (cancelled) return;
        highlighter = loaded;
        editorView.dispatch(editorView.state.tr.setMeta(key, "ready"));
      });
      return {
        destroy() {
          cancelled = true;
        },
      };
    },
  });
}

/// `CodeBlock` (the un-highlighted base extension) plus the header row's `filename` attr
/// (persisted the same way as `blockId` — a `data-*` attribute), Shiki-backed syntax
/// highlighting (see `ShikiHighlightPlugin` above — real TextMate grammars instead of
/// highlight.js's regex-based ones, notably more correct for TSX/JSX), and the React NodeView
/// that renders the header (§ code block header). `language` is already a built-in `CodeBlock`
/// attribute.
export const CodeBlockWithHeader = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      filename: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-filename"),
        renderHTML: (attributes: { filename?: string | null }) =>
          attributes.filename ? { "data-filename": attributes.filename } : {},
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      ShikiHighlightPlugin({
        name: this.name,
        defaultLanguage: this.options.defaultLanguage ?? "plaintext",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
});
