import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { HighlighterCore, ThemedToken } from "@shikijs/core";
import { CodeBlockComponent } from "./CodeBlockComponent";
import { ensureShikiLanguage, getShikiHighlighter, SHIKI_THEME_NAME } from "./shiki-highlighter";

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

/// One highlighted run inside a code block, relative to the block's own text.
interface TokenSpan {
  from: number;
  to: number;
  style: string;
}

/// Per slice time budget for background tokenizing, so a page full of code blocks
/// highlights over a few frames instead of freezing on open.
const SLICE_BUDGET_MS = 8;
/// Past this many distinct (language, code) pairs the cache is dropped wholesale.
const MAX_CACHED_BLOCKS = 500;

function tokenSpans(highlighter: HighlighterCore, code: string, language: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const lines = highlighter.codeToTokensBase(code, { lang: language, theme: SHIKI_THEME_NAME });
  for (const line of lines) {
    for (const token of line) {
      const style = decorationStyle(token);
      if (!style) continue;
      spans.push({ from: token.offset, to: token.offset + token.content.length, style });
    }
  }
  return spans;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/// Shiki highlighting as ProseMirror decorations, computed per code block and cached by
/// (language, code) so unchanged blocks are never tokenized twice:
/// - Edits only retokenize the code blocks a transaction actually touched, synchronously,
///   so the block being typed in recolors on the same frame.
/// - Everything else (the first paint of a page, a grammar that just finished loading) is
///   tokenized in the background in short time slices, each followed by a tagged `refresh`
///   transaction that rebuilds the set from the cache.
function ShikiHighlightPlugin({
  name,
  defaultLanguage,
}: {
  name: string;
  defaultLanguage: string;
}) {
  const key = new PluginKey<DecorationSet>("shikiHighlight");
  const cache = new Map<string, TokenSpan[]>();
  // Languages with no grammar to load (plain text, typos); never worth retrying.
  const unloadable = new Set<string>();
  let highlighter: HighlighterCore | null = null;
  let view: EditorView | null = null;
  let backgroundRunning = false;
  let backgroundQueued = false;

  const languageOf = (node: ProseMirrorNode): string => node.attrs.language || defaultLanguage;
  const cacheKey = (language: string, code: string) => `${language}\u0000${code}`;
  const isLoaded = (language: string) =>
    highlighter?.getLoadedLanguages().includes(language) ?? false;

  function tokenize(language: string, code: string): TokenSpan[] | undefined {
    const k = cacheKey(language, code);
    const hit = cache.get(k);
    if (hit || !highlighter || !isLoaded(language)) return hit;
    if (cache.size >= MAX_CACHED_BLOCKS) cache.clear();
    const spans = tokenSpans(highlighter, code, language);
    cache.set(k, spans);
    return spans;
  }

  /// `sync` tokenizes on a cache miss (the block being edited); otherwise a miss is
  /// left for the background pass to fill in.
  function blockDecorations(node: ProseMirrorNode, pos: number, sync: boolean): Decoration[] {
    const code = node.textContent;
    if (!code) return [];
    const language = languageOf(node);
    const spans = sync ? tokenize(language, code) : cache.get(cacheKey(language, code));
    if (!spans) {
      if (!unloadable.has(language)) scheduleBackground();
      return [];
    }
    const from = pos + 1;
    return spans.map((span) =>
      Decoration.inline(from + span.from, from + span.to, { style: span.style }),
    );
  }

  function buildFromCache(doc: ProseMirrorNode): DecorationSet {
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name !== name) return true;
      decorations.push(...blockDecorations(node, pos, false));
      return false;
    });
    return DecorationSet.create(doc, decorations);
  }

  /// Every code block whose (language, code) isn't cached yet.
  function uncachedBlocks(doc: ProseMirrorNode): { language: string; code: string }[] {
    const blocks: { language: string; code: string }[] = [];
    doc.descendants((node) => {
      if (node.type.name !== name) return true;
      const code = node.textContent;
      const language = languageOf(node);
      if (code && !unloadable.has(language) && !cache.has(cacheKey(language, code)))
        blocks.push({ language, code });
      return false;
    });
    return blocks;
  }

  function scheduleBackground() {
    if (backgroundRunning) {
      backgroundQueued = true;
      return;
    }
    backgroundRunning = true;
    // Deferred so the transaction that found the miss finishes painting first.
    setTimeout(() => {
      runBackground().finally(() => {
        backgroundRunning = false;
        if (backgroundQueued) {
          backgroundQueued = false;
          scheduleBackground();
        }
      });
    }, 0);
  }

  async function runBackground() {
    highlighter = await getShikiHighlighter();
    if (!view) return;
    const languages = new Set(uncachedBlocks(view.state.doc).map((b) => b.language));
    await Promise.all(
      [...languages].map(async (language) => {
        if (!(await ensureShikiLanguage(language))) unloadable.add(language);
      }),
    );
    while (view) {
      const pending = uncachedBlocks(view.state.doc).filter((b) => isLoaded(b.language));
      if (pending.length === 0) return;
      const started = performance.now();
      for (const block of pending) {
        tokenize(block.language, block.code);
        if (performance.now() - started > SLICE_BUDGET_MS) break;
      }
      view.dispatch(view.state.tr.setMeta(key, "refresh"));
      await yieldToBrowser();
    }
  }

  return new Plugin({
    key,
    state: {
      init: (_, { doc }) => buildFromCache(doc),
      apply(transaction, decorationSet, _oldState, newState) {
        if (transaction.getMeta(key) === "refresh") return buildFromCache(newState.doc);
        if (!transaction.docChanged) return decorationSet;

        let next = decorationSet.map(transaction.mapping, newState.doc);
        const { doc } = newState;
        const touched = new Map<number, ProseMirrorNode>();
        transaction.mapping.maps.forEach((stepMap, index) => {
          const rest = transaction.mapping.slice(index + 1);
          stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            const from = Math.min(rest.map(newStart, -1), doc.content.size);
            const to = Math.min(Math.max(rest.map(newEnd, 1), from), doc.content.size);
            doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name !== name) return true;
              touched.set(pos, node);
              return false;
            });
          });
        });
        for (const [pos, node] of touched) {
          next = next.remove(next.find(pos, pos + node.nodeSize));
          next = next.add(doc, blockDecorations(node, pos, true));
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        return key.getState(state);
      },
    },
    view(editorView) {
      view = editorView;
      scheduleBackground();
      return {
        destroy() {
          view = null;
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
