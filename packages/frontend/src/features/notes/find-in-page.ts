import { Extension } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
  /// The match and its capture groups, for `$1` in a replacement.
  groups: string[];
}

interface Range {
  from: number;
  to: number;
}

export interface FindState extends FindOptions {
  query: string;
  matches: FindMatch[];
  /// The match the bar is on, -1 for none.
  current: number;
  /// The query is a regular expression that does not parse.
  invalid: boolean;
  /// After Select All Occurrences: a caret or selection in each one, typed into together.
  multi: Range[] | null;
}

const EMPTY: FindState = {
  query: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  matches: [],
  current: -1,
  invalid: false,
  multi: null,
};

export const findKey = new PluginKey<FindState>("findInPage");

/// What a transaction asks the plugin to change.
interface FindMeta {
  patch?: Partial<Pick<FindState, "query" | "caseSensitive" | "wholeWord" | "regex" | "current">>;
  multi?: Range[] | null;
  /// Moves `current` to the first match at or after the selection.
  nearest?: boolean;
  reset?: boolean;
}

/// Characters of a word, for "whole word".
const WORD = String.raw`[\p{L}\p{N}_]`;

function patternOf(
  query: string,
  { caseSensitive, wholeWord, regex }: FindOptions,
): RegExp | "invalid" | null {
  if (!query) return null;
  const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const bounded = wholeWord ? `(?<!${WORD})(?:${source})(?!${WORD})` : source;
  try {
    return new RegExp(bounded, `gu${caseSensitive ? "" : "i"}`);
  } catch {
    return "invalid";
  }
}

/// The text of a textblock with each inline leaf (a formula, a mention) as one placeholder
/// character, so an index in the string is a position in the block.
function blockText(block: ProseNode): string {
  let text = "";
  block.forEach((child) => {
    text += child.isText ? (child.text ?? "") : "￼".repeat(child.nodeSize);
  });
  return text;
}

interface FindResult {
  matches: FindMatch[];
  /// The query is a regular expression that does not parse.
  invalid: boolean;
}

/// Every match in the document. A match never spans two blocks.
export function findMatches(doc: ProseNode, query: string, options: FindOptions): FindResult {
  const pattern = patternOf(query, options);
  if (pattern === null) return { matches: [], invalid: false };
  if (pattern === "invalid") return { matches: [], invalid: true };
  const matches: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const start = pos + 1;
    const text = blockText(node);
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      // An empty match (`a*` on "b") has nothing to select.
      if (match[0] === "" || match[0].includes("￼")) continue;
      matches.push({
        from: start + index,
        to: start + index + match[0].length,
        groups: [...match].map((group) => group ?? ""),
      });
    }
    return false;
  });
  return { matches, invalid: false };
}

/// A replacement with `$&`, `$1` to `$9` and `$$` expanded from a match, as a regular
/// expression replace does. Without regular expressions the text is taken as typed.
export function expandReplacement(replacement: string, match: FindMatch, regex: boolean): string {
  if (!regex) return replacement;
  return replacement.replace(/\$([$&1-9])/g, (whole, token: string) => {
    if (token === "$") return "$";
    if (token === "&") return match.groups[0] ?? "";
    return match.groups[Number(token)] ?? whole;
  });
}

/// The index of the first match that starts at or after `pos`, wrapping to the first.
function nearestIndex(matches: FindMatch[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index;
}

function mapRanges(ranges: Range[], tr: Transaction): Range[] {
  return ranges.map(({ from, to }) => ({
    from: tr.mapping.map(from, -1),
    to: tr.mapping.map(to, 1),
  }));
}

function computeState(previous: FindState, tr: Transaction, doc: ProseNode): FindState {
  // SAFETY: this plugin is the only writer of its meta key and always writes a `FindMeta`.
  const meta = tr.getMeta(findKey) as FindMeta | undefined;
  if (meta?.reset) {
    const { caseSensitive, wholeWord, regex } = previous;
    return { ...EMPTY, caseSensitive, wholeWord, regex };
  }
  let next = meta?.patch ? { ...previous, ...meta.patch } : previous;
  const searchChanged =
    next.query !== previous.query ||
    next.caseSensitive !== previous.caseSensitive ||
    next.wholeWord !== previous.wholeWord ||
    next.regex !== previous.regex;
  let multi = previous.multi;
  if (meta && "multi" in meta) multi = meta.multi ?? null;
  else if (tr.docChanged && multi) multi = mapRanges(multi, tr);
  // Moving the cursor yourself ends the shared one.
  else if (tr.selectionSet && !tr.docChanged) multi = null;

  if (searchChanged || tr.docChanged || meta?.nearest) {
    const { matches, invalid } = findMatches(doc, next.query, next);
    let current = next.current;
    if (searchChanged || meta?.nearest) current = nearestIndex(matches, tr.selection.from);
    else current = Math.min(current, matches.length - 1);
    next = { ...next, matches, invalid, current };
  }
  return multi === next.multi ? next : { ...next, multi };
}

function decorationsOf(state: EditorState): DecorationSet {
  const find = findKey.getState(state);
  if (!find) return DecorationSet.empty;
  const decorations: Decoration[] = find.matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === find.current ? "find-match find-match-current" : "find-match",
    }),
  );
  for (const range of find.multi ?? []) {
    decorations.push(
      range.from === range.to
        ? Decoration.widget(
            range.from,
            () => {
              const caret = document.createElement("span");
              caret.className = "find-multi-caret";
              return caret;
            },
            { key: `caret-${range.from}`, side: 1 },
          )
        : Decoration.inline(range.from, range.to, { class: "find-multi" }),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

export function findStateOf(state: EditorState | null): FindState {
  return (state && findKey.getState(state)) ?? EMPTY;
}

/// Writes `text` over every shared caret and selection, and leaves a caret after each.
function typeIntoAll(view: EditorView, text: string): boolean {
  const { multi } = findStateOf(view.state);
  if (!multi || !view.editable) return false;
  const tr = view.state.tr;
  // From the end, so a change never moves a range that is still to be written.
  for (const { from, to } of [...multi].sort((a, b) => b.from - a.from)) {
    if (text) tr.insertText(text, from, to);
    else tr.delete(from, to);
  }
  const placed = multi.map(({ to }) => {
    const pos = tr.mapping.map(to, 1);
    return { from: pos, to: pos };
  });
  finishMulti(view, tr, placed);
  return true;
}

/// Sends an edit that kept the shared carets, with the editor's own caret at the first.
function finishMulti(view: EditorView, tr: Transaction, placed: Range[]) {
  const [first] = placed;
  if (first) tr.setSelection(TextSelection.create(tr.doc, first.from));
  tr.setMeta(findKey, { multi: placed } satisfies FindMeta);
  view.dispatch(tr);
}

/// Backspace or Delete at every caret: the character beside it, or the selection.
function deleteInAll(view: EditorView, direction: -1 | 1): boolean {
  const { multi } = findStateOf(view.state);
  if (!multi || !view.editable) return false;
  const tr = view.state.tr;
  const ranges = multi.map(({ from, to }) => {
    if (from !== to) return { from, to };
    const $pos = view.state.doc.resolve(from);
    const at = from + direction;
    const inBlock = at >= $pos.start() && at <= $pos.end();
    return inBlock ? { from: Math.min(from, at), to: Math.max(from, at) } : { from, to: from };
  });
  for (const { from, to } of [...ranges].sort((a, b) => b.from - a.from)) {
    if (from !== to) tr.delete(from, to);
  }
  const placed = ranges.map(({ from }) => {
    const pos = tr.mapping.map(from, -1);
    return { from: pos, to: pos };
  });
  finishMulti(view, tr, placed);
  return true;
}

/// Search and replace inside the page. This holds the matches and draws them; the bar in
/// `FindBar.tsx` drives it through the functions below.
export const FindInPage = Extension.create({
  name: "findInPage",
  // Before the other typing handlers, so typing into every selected match is not their input.
  priority: 900,

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply: (tr, previous, _old, next) => computeState(previous, tr, next.doc),
        },
        props: {
          decorations: decorationsOf,
          handleTextInput: (view, _from, _to, text) => typeIntoAll(view, text),
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!findStateOf(view.state).multi || text === undefined || text === "") return false;
            return typeIntoAll(view, text.replace(/\s*\n\s*/g, " "));
          },
          handleKeyDown: (view, event) => {
            const { multi } = findStateOf(view.state);
            if (!multi || event.metaKey || event.ctrlKey || event.altKey) return false;
            if (event.key === "Backspace") return deleteInAll(view, -1);
            if (event.key === "Delete") return deleteInAll(view, 1);
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(findKey, { multi: null } satisfies FindMeta));
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            mousedown: (view) => {
              if (findStateOf(view.state).multi) {
                view.dispatch(view.state.tr.setMeta(findKey, { multi: null } satisfies FindMeta));
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

function dispatchMeta(view: EditorView, meta: FindMeta, tr = view.state.tr) {
  view.dispatch(tr.setMeta(findKey, meta));
}

/// Changes the query or an option, and moves to the nearest match.
export function setFind(
  view: EditorView,
  patch: Partial<Pick<FindState, "query" | "caseSensitive" | "wholeWord" | "regex">>,
) {
  dispatchMeta(view, { patch });
  selectCurrent(view);
}

/// Puts the editor's selection on the current match, scrolling it into view.
function selectCurrent(view: EditorView) {
  const { matches, current } = findStateOf(view.state);
  const match = matches[current];
  if (!match) return;
  const tr = view.state.tr
    .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
    .scrollIntoView();
  dispatchMeta(view, { multi: null }, tr);
}

/// Moves to the next (1) or previous (-1) match, wrapping around, and selects it.
export function stepFind(view: EditorView, step: 1 | -1) {
  const { matches, current } = findStateOf(view.state);
  if (matches.length === 0) return;
  const next = (Math.max(current, 0) + (current < 0 ? 0 : step) + matches.length) % matches.length;
  dispatchMeta(view, { patch: { current: next } });
  selectCurrent(view);
}

/// Clears the search, drawing no matches.
export function closeFind(view: EditorView) {
  dispatchMeta(view, { reset: true });
}

/// A caret or selection in every match, to type over them all at once.
export function selectAllMatches(view: EditorView): boolean {
  const { matches } = findStateOf(view.state);
  const [first] = matches;
  if (!first) return false;
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, first.from, first.to));
  dispatchMeta(view, { multi: matches.map(({ from, to }) => ({ from, to })) }, tr);
  return true;
}

/// Replaces the current match, then moves on to the next. Returns whether it replaced one.
export function replaceCurrent(view: EditorView, replacement: string): boolean {
  const find = findStateOf(view.state);
  const match = find.matches[find.current];
  if (!match || !view.editable) return false;
  const text = expandReplacement(replacement, match, find.regex);
  const tr = view.state.tr;
  if (text) tr.insertText(text, match.from, match.to);
  else tr.delete(match.from, match.to);
  // The next match starts where this one ended.
  const after = tr.mapping.map(match.to, 1);
  tr.setSelection(TextSelection.near(tr.doc.resolve(after)));
  dispatchMeta(view, { nearest: true, multi: null }, tr);
  selectCurrent(view);
  return true;
}

/// Replaces every match. Returns how many it replaced.
export function replaceAll(view: EditorView, replacement: string): number {
  const find = findStateOf(view.state);
  if (find.matches.length === 0 || !view.editable) return 0;
  const tr = view.state.tr;
  for (const match of [...find.matches].reverse()) {
    const text = expandReplacement(replacement, match, find.regex);
    if (text) tr.insertText(text, match.from, match.to);
    else tr.delete(match.from, match.to);
  }
  dispatchMeta(view, { multi: null }, tr);
  return find.matches.length;
}
