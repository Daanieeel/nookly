import { textblockTypeInputRule } from "@tiptap/core";
import { CodeBlock, type CodeBlockOptions } from "@tiptap/extension-code-block";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockComponent } from "./CodeBlockComponent";
import { ensureLanguage, highlightSpans, isLanguageLoaded, type TokenSpan } from "./highlighter";

/// Per slice time budget for background tokenizing, so a page full of code blocks
/// highlights over a few frames instead of freezing on open.
const SLICE_BUDGET_MS = 8;
/// Past this many distinct (language, code) pairs the cache is dropped wholesale.
const MAX_CACHED_BLOCKS = 500;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/// Syntax highlighting (see `highlighter.ts`) as ProseMirror decorations, computed per code block and cached by
/// (language, code) so unchanged blocks are never tokenized twice:
/// - Edits only retokenize the code blocks a transaction actually touched, synchronously,
///   so the block being typed in recolors on the same frame.
/// - Everything else (the first paint of a page, a grammar that just finished loading) is
///   tokenized in the background in short time slices, each followed by a tagged `refresh`
///   transaction that rebuilds the set from the cache.
function HighlightPlugin({ name, defaultLanguage }: { name: string; defaultLanguage: string }) {
  const key = new PluginKey<DecorationSet>("codeHighlight");
  const cache = new Map<string, TokenSpan[]>();
  // Languages with no grammar to load (plain text, typos); never worth retrying.
  const unloadable = new Set<string>();
  let view: EditorView | null = null;
  let backgroundRunning = false;
  let backgroundQueued = false;

  const languageOf = (node: ProseMirrorNode): string => node.attrs.language || defaultLanguage;
  const cacheKey = (language: string, code: string) => `${language}\u0000${code}`;

  function tokenize(language: string, code: string): TokenSpan[] | undefined {
    const k = cacheKey(language, code);
    const hit = cache.get(k);
    if (hit || !isLanguageLoaded(language)) return hit;
    if (cache.size >= MAX_CACHED_BLOCKS) cache.clear();
    const spans = highlightSpans(language, code);
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
    if (!view) return;
    const languages = new Set(uncachedBlocks(view.state.doc).map((b) => b.language));
    await Promise.all(
      [...languages].map(async (language) => {
        if (!(await ensureLanguage(language))) unloadable.add(language);
      }),
    );
    while (view) {
      const pending = uncachedBlocks(view.state.doc).filter((b) => isLanguageLoaded(b.language));
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
/// (persisted the same way as `blockId` — a `data-*` attribute), syntax highlighting (see
/// `HighlightPlugin` above; twinkleplop with a Shiki fallback, both notably more correct for
/// TSX/JSX than highlight.js's regex-based grammars were), and the React NodeView
/// that renders the header (§ code block header). `language` is already a built-in `CodeBlock`
/// attribute.
export const CodeBlockWithHeader = CodeBlock.extend<
  CodeBlockOptions & { getNewLanguage: () => string | null }
>({
  addOptions() {
    // SAFETY: `parent` is `CodeBlock`'s own `addOptions`, which always returns every `CodeBlockOptions` key.
    const options = this.parent?.() as CodeBlockOptions;
    return { ...options, getNewLanguage: () => null };
  },
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
  // A block made here starts with the default language (see `default-code-language.ts`). Only
  // creation does: loading, pasting and turning a block off never touch a block's language, which
  // is why toggling off is spelled out rather than passed the default as attributes to match.
  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.setNode(this.name, {
            language: this.options.getNewLanguage(),
            ...attributes,
          }),
      toggleCodeBlock:
        (attributes) =>
        ({ commands, editor }) =>
          editor.isActive(this.name)
            ? commands.setNode("paragraph")
            : commands.setNode(this.name, {
                language: this.options.getNewLanguage(),
                ...attributes,
              }),
    };
  },
  addInputRules() {
    const fence = (find: RegExp) =>
      textblockTypeInputRule({
        find,
        type: this.type,
        getAttributes: (match) => ({ language: match[1] || this.options.getNewLanguage() }),
      });
    return [fence(/^```([a-z]+)?[\s\n]$/), fence(/^~~~([a-z]+)?[\s\n]$/)];
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      HighlightPlugin({
        name: this.name,
        defaultLanguage: this.options.defaultLanguage ?? "plaintext",
      }),
      AutoCloseBrackets(this.name),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: ({ editor }) => indentCodeBlock(editor, this.name, "in"),
      "Shift-Tab": ({ editor }) => indentCodeBlock(editor, this.name, "out"),
    };
  },
});

const CLOSERS = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ['"', '"'],
  ["'", "'"],
  ["`", "`"],
]);
const QUOTES = new Set(['"', "'", "`"]);
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/// Typing an opening bracket or quote in a code block adds its partner, typing the partner
/// right before an identical one steps over it, and Backspace between an empty pair removes
/// both. Typing over a selection wraps it instead. Quotes only pair next to non-word text,
/// so an apostrophe in `don't` stays a single character.
function AutoCloseBrackets(name: string) {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        const { $from } = state.selection;
        if ($from.parent.type.name !== name || text.length !== 1) return false;
        const close = CLOSERS.get(text);
        const before = state.doc.textBetween(Math.max($from.start(), from - 1), from);
        const after = state.doc.textBetween(to, Math.min($from.end(), to + 1));
        // Typing the partner of a pair we added steps over it.
        if (from === to && after === text && (QUOTES.has(text) || ")]}".includes(text))) {
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to + 1)));
          return true;
        }
        if (close === undefined) return false;
        if (from !== to) {
          const tr = state.tr.insertText(text + state.doc.textBetween(from, to) + close, from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
          view.dispatch(tr);
          return true;
        }
        if (
          QUOTES.has(text)
            ? WORD_CHAR.test(before) || WORD_CHAR.test(after)
            : after !== "" && !/[\s)\]}>,;:.]/.test(after)
        ) {
          return false;
        }
        const tr = state.tr.insertText(text + close, from, to);
        tr.setSelection(TextSelection.create(tr.doc, from + 1));
        view.dispatch(tr);
        return true;
      },
      handleKeyDown(view, event) {
        if (event.key !== "Backspace" || event.metaKey || event.ctrlKey || event.altKey)
          return false;
        const { state } = view;
        const { $from, empty } = state.selection;
        if (!empty || $from.parent.type.name !== name) return false;
        const pos = $from.pos;
        const before = state.doc.textBetween(Math.max($from.start(), pos - 1), pos);
        const after = state.doc.textBetween(pos, Math.min($from.end(), pos + 1));
        if (!before || CLOSERS.get(before) !== after) return false;
        view.dispatch(state.tr.delete(pos - 1, pos + 1));
        return true;
      },
    },
  });
}

/// Tab inside a code block types a real tab character (a selection over several lines
/// indents each of them); Shift+Tab takes one tab, or up to four spaces, off the start of
/// each selected line. Always handled in a code block, so Tab never leaves the editor.
function indentCodeBlock(editor: Editor, name: string, direction: "in" | "out"): boolean {
  const { state } = editor;
  const { $from, $to, empty } = state.selection;
  if ($from.parent.type.name !== name || $from.parent !== $to.parent) return false;
  if (direction === "in" && empty) {
    editor.commands.insertContent("\t");
    return true;
  }
  const blockStart = $from.start();
  const text = $from.parent.textContent;
  const from = $from.parentOffset;
  const to = $to.parentOffset;
  // Offsets (in the block's text) where each line the selection touches begins.
  const lineStarts: number[] = [];
  let lineStart = text.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  if (from === 0) lineStart = 0;
  for (;;) {
    lineStarts.push(lineStart);
    const next = text.indexOf("\n", lineStart);
    if (next === -1 || next + 1 >= to) break;
    lineStart = next + 1;
  }
  const tr = state.tr;
  // Back to front, so earlier offsets stay valid while the text changes.
  for (const start of lineStarts.reverse()) {
    const at = blockStart + start;
    if (direction === "in") {
      tr.insertText("\t", at);
      continue;
    }
    const lead = /^(\t| {1,4})/.exec(text.slice(start))?.[0];
    if (lead) tr.delete(at, at + lead.length);
  }
  editor.view.dispatch(tr);
  return true;
}
