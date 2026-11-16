import type { Node as ProseNode } from "prosemirror-model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/// Find in the page for the tablet's editor, as the desktop's `find-in-page.ts` searches
/// (case aside): what is typed, every match drawn, the current one selected. The desktop's
/// is a tiptap extension; this editor is ProseMirror on its own, so it has this plugin.

interface Match {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  matches: Match[];
  /// The current match's index, -1 with none.
  current: number;
}

type FindMeta = { query: string } | { step: 1 | -1 };

const findKey = new PluginKey<FindState>("find");

const EMPTY: FindState = { query: "", matches: [], current: -1 };

/// Every place `query` stands in the page's text, ignoring case.
function matchesOf(doc: ProseNode, query: string): Match[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  const found: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, "￼", "￼").toLocaleLowerCase();
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
      found.push({ from: pos + 1 + at, to: pos + 1 + at + needle.length });
    }
    return false;
  });
  return found;
}

function apply(tr: Transaction, previous: FindState): FindState {
  // SAFETY: only `moveTo` below sets this plugin's meta, always a `FindMeta`.
  const meta = tr.getMeta(findKey) as FindMeta | undefined;
  if (meta && "query" in meta) {
    const matches = matchesOf(tr.doc, meta.query);
    return { query: meta.query, matches, current: matches.length > 0 ? 0 : -1 };
  }
  if (meta && "step" in meta) {
    const count = previous.matches.length;
    if (count === 0) return previous;
    return { ...previous, current: (previous.current + meta.step + count) % count };
  }
  if (!tr.docChanged || !previous.query) return previous;
  const matches = matchesOf(tr.doc, previous.query);
  return { ...previous, matches, current: Math.min(previous.current, matches.length - 1) };
}

export function findPlugin() {
  return new Plugin<FindState>({
    key: findKey,
    state: { init: () => EMPTY, apply },
    props: {
      decorations(state) {
        const { matches, current } = findKey.getState(state) ?? EMPTY;
        if (matches.length === 0) return DecorationSet.empty;
        return DecorationSet.create(
          state.doc,
          matches.map((m, i) =>
            Decoration.inline(m.from, m.to, { class: i === current ? "find-current" : "find" }),
          ),
        );
      },
    },
  });
}

/// How many matches there are and which one is shown, from 1 (0 with none).
export interface FindResult {
  count: number;
  index: number;
}

export function findResult(state: EditorState): FindResult {
  const { matches, current } = findKey.getState(state) ?? EMPTY;
  return { count: matches.length, index: current + 1 };
}

type Dispatch = (tr: Transaction) => void;

/// Selects the current match and scrolls it into view, after `meta` is applied.
function moveTo(state: EditorState, dispatch: Dispatch, meta: FindMeta) {
  const tr = state.tr.setMeta(findKey, meta);
  const next = apply(tr, findKey.getState(state) ?? EMPTY);
  const match = next.matches[next.current];
  if (match)
    tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView();
  dispatch(tr);
}

/// Searches for `query`; an empty one clears the search.
export const findQuery = (query: string) => (state: EditorState, dispatch: Dispatch) =>
  moveTo(state, dispatch, { query });

/// Moves to the next (1) or previous (-1) match, round at either end.
export const findStep = (step: 1 | -1) => (state: EditorState, dispatch: Dispatch) =>
  moveTo(state, dispatch, { step });
