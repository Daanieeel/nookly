import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseNode, ResolvedPos } from "@tiptap/pm/model";
import {
  EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { settings } from "#/lib/settings/settings.ts";
import { firstNonBlank, nextWordStart, prevWordStart, wordEnd, wordObject } from "./vim-core";

export type VimMode = "normal" | "insert" | "visual" | "visual-line";

export interface VimState {
  mode: VimMode;
  /// Digits typed so far, `"12"` of `12dd`.
  count: string;
  /// A `d`, `c` or `y` waiting for its motion.
  operator: "" | "d" | "c" | "y";
  /// A `g`, `i`, `a` or `r` waiting for its second key.
  prefix: "" | "g" | "i" | "a" | "r";
  /// What was last deleted or copied.
  register: { text: string; linewise: boolean };
  /// Where visual mode started.
  anchor: number | null;
  /// The column `j` and `k` aim for, kept across short lines.
  wantCol: number | null;
  /// The key help is open.
  help: boolean;
}

const INITIAL: VimState = {
  mode: "normal",
  count: "",
  operator: "",
  prefix: "",
  register: { text: "", linewise: false },
  anchor: null,
  wantCol: null,
  help: false,
};

const key = new PluginKey<VimState>("vim");

/// The Vim state of an editor: its mode, what is half typed, the register.
export function vimState(state: EditorState): VimState {
  return key.getState(state) ?? INITIAL;
}

/// Closes the key help, as the dialog asks to when it is dismissed.
export function closeVimHelp(editor: Editor) {
  const vim = vimState(editor.state);
  if (vim.help) editor.view.dispatch(editor.state.tr.setMeta(key, { ...vim, help: false }));
}

const enabled = () => settings.get("notes.vimMode");
/// An inline node (a formula, a mention) is one character of the line.
const LEAF = "￼";

interface Line {
  start: number;
  end: number;
  text: string;
  $pos: ResolvedPos;
}

function lineAt(doc: ProseNode, pos: number): Line | null {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, "", LEAF);
  return { start: $pos.start(), end: $pos.end(), text, $pos };
}

/// Every textblock of the page in order, as `[start, end]` of its content.
function textblocks(doc: ProseNode): [number, number][] {
  const found: [number, number][] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) found.push([pos + 1, pos + 1 + node.content.size]);
    return !node.isTextblock;
  });
  return found;
}

/// The last position the cursor can sit on in a line: its final character, or its start
/// when it is empty.
const lastCell = (line: Line) => Math.max(line.start, line.end - 1);

/// The motions that move across a line, as `[target, inclusive]`, or null when the key is not one.
type Motion = (doc: ProseNode, pos: number, count: number, state: VimState) => [number, boolean];

function repeat(times: number, from: number, step: (at: number) => number): number {
  let at = from;
  for (let i = 0; i < times; i++) {
    const next = step(at);
    if (next === at) break;
    at = next;
  }
  return at;
}

function adjacentLine(doc: ProseNode, pos: number, direction: -1 | 1): [number, number] | null {
  const blocks = textblocks(doc);
  const index = blocks.findIndex(([start, end]) => pos >= start && pos <= end);
  return blocks[index + direction] ?? null;
}

const MOTIONS = new Map<string, Motion>(
  Object.entries({
    h: (doc, pos, count) => {
      const line = lineAt(doc, pos);
      return [line ? Math.max(line.start, pos - count) : pos, false];
    },
    l: (doc, pos, count) => {
      const line = lineAt(doc, pos);
      return [line ? Math.min(lastCell(line), pos + count) : pos, false];
    },
    "0": (doc, pos) => [lineAt(doc, pos)?.start ?? pos, false],
    "^": (doc, pos) => {
      const line = lineAt(doc, pos);
      return [line ? line.start + firstNonBlank(line.text) : pos, false];
    },
    $: (doc, pos) => {
      const line = lineAt(doc, pos);
      return [line ? lastCell(line) : pos, true];
    },
    w: (doc, pos, count) => {
      let at = pos;
      for (let i = 0; i < count; i++) {
        const line = lineAt(doc, at);
        if (!line) break;
        const next = nextWordStart(line.text, at - line.start);
        if (next < line.text.length) at = line.start + next;
        else {
          const following = adjacentLine(doc, at, 1);
          if (!following) return [line.end, false];
          at = following[0];
        }
      }
      return [at, false];
    },
    b: (doc, pos, count) => {
      let at = pos;
      for (let i = 0; i < count; i++) {
        const line = lineAt(doc, at);
        if (!line) break;
        if (at === line.start) {
          const before = adjacentLine(doc, at, -1);
          if (!before) break;
          at = before[0];
          const previous = lineAt(doc, at);
          if (previous) at = previous.start + prevWordStart(previous.text, previous.text.length);
        } else {
          at = line.start + prevWordStart(line.text, at - line.start);
        }
      }
      return [at, false];
    },
    e: (doc, pos, count) => [
      repeat(count, pos, (at) => {
        const line = lineAt(doc, at);
        return line ? line.start + wordEnd(line.text, at - line.start) : at;
      }),
      true,
    ],
    "{": (doc, pos, count) => [
      repeat(count, pos, (at) => adjacentLine(doc, at, -1)?.[0] ?? at),
      false,
    ],
    "}": (doc, pos, count) => [
      repeat(count, pos, (at) => adjacentLine(doc, at, 1)?.[0] ?? at),
      false,
    ],
  } satisfies Record<string, Motion>),
);

/// Moves up or down by lines, staying in the column the cursor was aiming for.
interface VerticalMove {
  pos: number;
  col: number;
}

function vertical(
  view: EditorView,
  pos: number,
  count: number,
  direction: -1 | 1,
  wantCol: number | null,
): VerticalMove {
  const here = lineAt(view.state.doc, pos);
  const col = wantCol ?? (here ? pos - here.start : 0);
  let at = pos;
  for (let i = 0; i < count; i++) {
    const next = adjacentLine(view.state.doc, at, direction);
    if (!next) break;
    const line = lineAt(view.state.doc, next[0]);
    if (!line) break;
    at = Math.min(line.start + col, lastCell(line));
  }
  return { pos: at, col };
}

/// Where the cursor sits in a state: the end of the range in visual mode, else the caret.
function cursorOf(state: EditorState, vim: VimState): number {
  const { selection } = state;
  if (vim.anchor === null) return selection.head;
  // A visual selection covers the cursor's own character, so the cursor is the end that is not
  // the anchor, one before the selection's far edge when it runs forward.
  return selection.head > vim.anchor ? selection.head - 1 : selection.head;
}

/// Puts the editor in `patch`'s state with the selection `selection`.
function commit(view: EditorView, tr: Transaction, vim: VimState, patch: Partial<VimState>) {
  view.dispatch(tr.setMeta(key, { ...vim, ...patch }));
}

function selectionAt(doc: ProseNode, pos: number): TextSelection {
  return TextSelection.create(doc, Math.max(1, Math.min(pos, doc.content.size - 1)));
}

function selectRange(doc: ProseNode, anchor: number, cursor: number): TextSelection {
  const from = Math.min(anchor, cursor);
  const to = Math.max(anchor, cursor);
  const end = lineAt(doc, to);
  const covered = end && to < end.end ? to + 1 : to;
  return TextSelection.create(doc, from, covered);
}

/// The text of `[from, to)` and whether it ends a whole line, for the register.
function textOf(doc: ProseNode, from: number, to: number): string {
  return doc.textBetween(from, to, "\n", LEAF);
}

function deleteRange(tr: Transaction, from: number, to: number) {
  if (to > from) tr.delete(from, to);
}

/// Runs an operator over `[from, to)` inside a line.
function operateOnRange(
  view: EditorView,
  vim: VimState,
  operator: "d" | "c" | "y",
  from: number,
  to: number,
) {
  const { state } = view;
  const text = textOf(state.doc, from, to);
  const register = { text, linewise: false };
  const tr = state.tr;
  if (operator !== "y") deleteRange(tr, from, to);
  const after = Math.min(from, tr.doc.content.size - 1);
  const line = lineAt(tr.doc, after);
  const rest = operator === "c" ? after : line ? Math.min(after, lastCell(line)) : after;
  tr.setSelection(selectionAt(tr.doc, rest));
  commit(view, tr, vim, {
    mode: operator === "c" ? "insert" : "normal",
    operator: "",
    prefix: "",
    count: "",
    anchor: null,
    register:
      operator === "y" ? register : operator === "d" || operator === "c" ? register : vim.register,
  });
}

/// Runs an operator over `count` whole lines from the cursor's (`dd`, `yy`, `cc`), or over the
/// lines `[first, last]` in visual line mode.
function operateOnLines(
  view: EditorView,
  vim: VimState,
  operator: "d" | "c" | "y",
  firstPos: number,
  lastPos: number,
) {
  const { state } = view;
  const blocks = textblocks(state.doc).filter(([s, e]) => e >= firstPos && s <= lastPos);
  if (blocks.length === 0) return;
  const text = blocks.map(([s, e]) => textOf(state.doc, s, e)).join("\n");
  const register = { text, linewise: true };
  const tr = state.tr;
  if (operator !== "y") {
    // Bottom to top so earlier positions stay valid. A block that is the only child of its
    // parent is emptied instead of removed, and so is the last block of the page.
    for (const [s, e] of blocks.toReversed()) {
      const $s = tr.doc.resolve(s);
      const container = $s.node($s.depth - 1);
      const alone = container.childCount === 1 || $s.depth > 1;
      if (operator === "c" || alone) tr.delete(s, e);
      else tr.delete($s.before(), $s.after());
    }
  }
  const target = Math.min(blocks[0]?.[0] ?? 1, tr.doc.content.size - 1);
  const nearest = Selection.near(tr.doc.resolve(Math.max(1, target)));
  tr.setSelection(nearest);
  commit(view, tr, vim, {
    mode: operator === "c" ? "insert" : "normal",
    operator: "",
    prefix: "",
    count: "",
    anchor: null,
    register,
  });
}

function startInsert(view: EditorView, vim: VimState, pos: number) {
  commit(view, view.state.tr.setSelection(selectionAt(view.state.doc, pos)), vim, {
    mode: "insert",
    count: "",
    operator: "",
    prefix: "",
    anchor: null,
    wantCol: null,
  });
}

function openLine(view: EditorView, vim: VimState, below: boolean) {
  const line = lineAt(view.state.doc, view.state.selection.head);
  if (!line) return;
  const at = below ? line.$pos.after() : line.$pos.before();
  const paragraph = view.state.schema.nodes.paragraph?.createAndFill();
  if (!paragraph) return;
  const tr = view.state.tr.insert(at, paragraph);
  commit(view, tr.setSelection(selectionAt(tr.doc, at + 1)), vim, {
    mode: "insert",
    count: "",
    operator: "",
    prefix: "",
    wantCol: null,
  });
}

function paste(view: EditorView, vim: VimState, before: boolean, count: number) {
  const { text, linewise } = vim.register;
  if (!text) return;
  const { state } = view;
  const line = lineAt(state.doc, state.selection.head);
  if (!line) return;
  const tr = state.tr;
  if (linewise) {
    const at = before ? line.$pos.before() : line.$pos.after();
    const nodes = Array.from({ length: count }, () => text.split("\n")).flat();
    const paragraphs = nodes.map((t) => {
      const content = t ? state.schema.text(t) : undefined;
      return state.schema.nodes.paragraph?.createAndFill(null, content);
    });
    tr.insert(
      at,
      paragraphs.filter((p): p is ProseNode => Boolean(p)),
    );
    commit(view, tr.setSelection(selectionAt(tr.doc, at + 1)), vim, { count: "", operator: "" });
    return;
  }
  const pos = state.selection.head;
  const at = before || line.end === line.start ? pos : pos + 1;
  const insert = text.repeat(count);
  tr.insertText(insert, at);
  commit(view, tr.setSelection(selectionAt(tr.doc, at + insert.length - 1)), vim, {
    count: "",
    operator: "",
  });
}

const reset = { count: "", operator: "", prefix: "" } as const;

/// The key a motion or command is looked up by.
function keyOf(event: KeyboardEvent): string {
  if (event.key === "Enter") return "j";
  if (event.key === "Backspace") return "h";
  return event.key;
}

function handleNormalKey(
  editor: Editor,
  view: EditorView,
  event: KeyboardEvent,
  vim: VimState,
): boolean {
  const { state } = view;
  const k = keyOf(event);
  const visual = vim.mode === "visual" || vim.mode === "visual-line";
  const cursor = cursorOf(state, vim);

  if (k === "Escape" || (event.ctrlKey && k === "[")) {
    if (vim.help) return commitReset(view, vim, { help: false });
    if (visual) {
      commit(view, state.tr.setSelection(selectionAt(state.doc, cursor)), vim, {
        ...reset,
        mode: "normal",
        anchor: null,
      });
    } else commitReset(view, vim, {});
    return true;
  }
  if (event.ctrlKey) {
    if (k === "r") {
      view.dispatch(state.tr.setMeta(key, { ...vim, ...reset }));
      editor.commands.redo();
    }
    return true;
  }

  // The second key of g, i, a and r.
  if (vim.prefix === "r") {
    if (k.length === 1) {
      const line = lineAt(state.doc, cursor);
      if (line && cursor < line.end) {
        const tr = state.tr.insertText(k, cursor, cursor + 1);
        commit(view, tr.setSelection(selectionAt(tr.doc, cursor)), vim, reset);
        return true;
      }
    }
    return commitReset(view, vim, {});
  }
  const count = vim.count ? Number(vim.count) : 1;
  if (vim.prefix === "g") {
    if (k === "g") {
      const first = textblocks(state.doc)[0];
      if (first) moveTo(view, vim, visual, first[0], false);
      return true;
    }
    return commitReset(view, vim, {});
  }
  if ((vim.prefix === "i" || vim.prefix === "a") && (vim.operator || visual)) {
    return textObject(view, vim, k, vim.prefix === "a", cursor, visual);
  }

  // Counts. A 0 is a motion unless it follows other digits.
  if (/^[1-9]$/.test(k) || (k === "0" && vim.count)) {
    commit(view, state.tr, vim, { count: vim.count + k });
    return true;
  }

  if (k === "?") {
    commit(view, state.tr, vim, { ...reset, help: true });
    return true;
  }

  // Operators.
  if (k === "d" || k === "c" || k === "y") {
    if (visual) {
      applyVisual(view, vim, k);
    } else if (vim.operator === k) {
      const lines = Math.max(1, count);
      const blocks = textblocks(state.doc);
      const index = blocks.findIndex(([s, e]) => cursor >= s && cursor <= e);
      const last = blocks[Math.min(blocks.length - 1, index + lines - 1)];
      if (index >= 0 && last) operateOnLines(view, vim, k, blocks[index]?.[0] ?? cursor, last[1]);
    } else {
      commit(view, state.tr, vim, { operator: k });
    }
    return true;
  }
  if ((k === "D" || k === "C") && !visual) {
    const line = lineAt(state.doc, cursor);
    if (line) operateOnRange(view, vim, k === "D" ? "d" : "c", cursor, line.end);
    return true;
  }
  if (k === "Y" && !visual) {
    const blocks = textblocks(state.doc).find(([s, e]) => cursor >= s && cursor <= e);
    if (blocks) operateOnLines(view, vim, "y", blocks[0], blocks[1]);
    return true;
  }
  if (k === "x" || k === "X") {
    if (visual) return (applyVisual(view, vim, "d"), true);
    const line = lineAt(state.doc, cursor);
    if (!line || line.end === line.start) return true;
    if (k === "x") operateOnRange(view, vim, "d", cursor, Math.min(line.end, cursor + count));
    else if (cursor > line.start)
      operateOnRange(view, vim, "d", Math.max(line.start, cursor - count), cursor);
    return true;
  }
  if ((k === "s" || k === "S") && !visual) {
    const line = lineAt(state.doc, cursor);
    if (!line) return true;
    if (k === "s") operateOnRange(view, vim, "c", cursor, Math.min(line.end, cursor + count));
    else operateOnLines(view, vim, "c", line.start, line.end);
    return true;
  }
  if (visual && (k === "v" || k === "V")) {
    const same = (k === "v") === (vim.mode === "visual");
    if (same) {
      commit(view, state.tr.setSelection(selectionAt(state.doc, cursor)), vim, {
        ...reset,
        mode: "normal",
        anchor: null,
      });
    } else {
      commit(view, state.tr, vim, { mode: k === "v" ? "visual" : "visual-line" });
      syncVisual(view, { ...vim, mode: k === "v" ? "visual" : "visual-line" }, cursor);
    }
    return true;
  }
  if (!visual && !vim.operator) {
    switch (k) {
      case "i":
        if (vim.operator === "") {
          // Waits for a text object only after an operator; plain `i` inserts.
          startInsert(view, vim, state.selection.head);
        }
        return true;
      case "a": {
        const line = lineAt(state.doc, state.selection.head);
        startInsert(
          view,
          vim,
          line && line.end > line.start ? state.selection.head + 1 : state.selection.head,
        );
        return true;
      }
      case "I": {
        const line = lineAt(state.doc, state.selection.head);
        if (line)
          startInsert(view, vim, line.start + Math.min(firstNonBlank(line.text), line.text.length));
        return true;
      }
      case "A": {
        const line = lineAt(state.doc, state.selection.head);
        if (line) startInsert(view, vim, line.end);
        return true;
      }
      case "o":
      case "O":
        openLine(view, vim, k === "o");
        return true;
      case "p":
      case "P":
        paste(view, vim, k === "P", count);
        return true;
      case "u":
        view.dispatch(state.tr.setMeta(key, { ...vim, ...reset }));
        editor.commands.undo();
        return true;
      case "r":
        commit(view, state.tr, vim, { prefix: "r" });
        return true;
      case "v":
      case "V": {
        const mode = k === "v" ? "visual" : "visual-line";
        const next: VimState = { ...vim, mode, anchor: cursor };
        commit(view, state.tr, vim, { mode, anchor: cursor });
        syncVisual(view, next, cursor);
        return true;
      }
      default:
        break;
    }
  }
  if (k === "g" || ((k === "i" || k === "a") && (vim.operator || visual))) {
    commit(view, state.tr, vim, { prefix: k });
    return true;
  }
  if (k === "G") {
    const blocks = textblocks(state.doc);
    const target = vim.count
      ? blocks[Math.min(Number(vim.count), blocks.length) - 1]
      : blocks.at(-1);
    if (target) moveTo(view, vim, visual, target[0], false);
    return true;
  }

  // Motions, alone, after an operator or extending a selection.
  if (k === "j" || k === "k") {
    const moved = vertical(view, cursor, count, k === "j" ? 1 : -1, vim.wantCol);
    if (vim.operator) {
      const from = adjacentRange(cursor, moved.pos);
      operateOnLines(view, vim, vim.operator, from[0], from[1]);
    } else moveTo(view, vim, visual, moved.pos, true, moved.col);
    return true;
  }
  const motion = MOTIONS.get(k);
  if (motion) {
    const [target, inclusive] = motion(state.doc, cursor, count, vim);
    if (vim.operator) {
      const line = lineAt(state.doc, cursor);
      if (!line) return commitReset(view, vim, {});
      // `cw` changes the word, not the space after it, like `ce`.
      const word =
        vim.operator === "c" && k === "w" && !/\s/.test(line.text.charAt(cursor - line.start));
      const edge = word ? lineEndOfWord(line, cursor) : target;
      const from = Math.min(cursor, edge);
      const to = Math.min(line.end, Math.max(cursor, edge) + (inclusive ? 1 : 0));
      operateOnRange(view, vim, vim.operator, from, to);
    } else moveTo(view, vim, visual, target, false);
    return true;
  }
  return commitReset(view, vim, {});
}

/// The end of the word the cursor is in, exclusive.
function lineEndOfWord(line: Line, cursor: number): number {
  const [, to] = wordObject(line.text, cursor - line.start, false);
  return line.start + to;
}

/// The first and last position of the lines from the cursor's to `to`'s, both included.
function adjacentRange(from: number, to: number): [number, number] {
  return [Math.min(from, to), Math.max(from, to)];
}

function commitReset(view: EditorView, vim: VimState, patch: Partial<VimState>): boolean {
  commit(view, view.state.tr, vim, { ...reset, ...patch });
  return true;
}

/// Moves the cursor, extending the selection in visual mode.
function moveTo(
  view: EditorView,
  vim: VimState,
  visual: boolean,
  to: number,
  keepColumn: boolean,
  column?: number,
) {
  const { state } = view;
  const target = Math.max(1, Math.min(to, state.doc.content.size - 1));
  const patch: Partial<VimState> = { ...reset, wantCol: keepColumn ? (column ?? null) : null };
  if (visual && vim.anchor !== null) {
    const next = { ...vim, ...patch };
    const tr = state.tr.setSelection(visualSelection(state.doc, next, target));
    commit(view, tr, vim, patch);
    return;
  }
  const line = lineAt(state.doc, target);
  const at = line ? Math.min(target, lastCell(line)) : target;
  commit(view, state.tr.setSelection(selectionAt(state.doc, at)), vim, patch);
}

function visualSelection(doc: ProseNode, vim: VimState, cursor: number): TextSelection {
  const anchor = vim.anchor ?? cursor;
  if (vim.mode === "visual-line") {
    const first = lineAt(doc, Math.min(anchor, cursor));
    const last = lineAt(doc, Math.max(anchor, cursor));
    return TextSelection.create(doc, first?.start ?? anchor, last?.end ?? cursor);
  }
  return selectRange(doc, anchor, cursor);
}

function syncVisual(view: EditorView, vim: VimState, cursor: number) {
  view.dispatch(
    view.state.tr.setSelection(visualSelection(view.state.doc, vim, cursor)).setMeta(key, vim),
  );
}

function applyVisual(view: EditorView, vim: VimState, operator: "d" | "c" | "y") {
  const { selection, doc } = view.state;
  if (vim.mode === "visual-line") {
    operateOnLines(view, vim, operator, selection.from, selection.to);
    return;
  }
  const to = Math.min(selection.to, doc.content.size);
  operateOnRange(view, { ...vim, anchor: null }, operator, selection.from, to);
}

function textObject(
  view: EditorView,
  vim: VimState,
  object: string,
  around: boolean,
  cursor: number,
  visual: boolean,
): boolean {
  const { state } = view;
  const line = lineAt(state.doc, cursor);
  if (!line) return commitReset(view, vim, {});
  if (object === "w") {
    const [from, to] = wordObject(line.text, cursor - line.start, around);
    if (visual) {
      const next = { ...vim, ...reset, anchor: line.start + from };
      commit(
        view,
        state.tr.setSelection(selectRange(state.doc, line.start + from, line.start + to - 1)),
        vim,
        {
          ...reset,
          anchor: next.anchor,
        },
      );
    } else if (vim.operator) {
      operateOnRange(view, vim, vim.operator, line.start + from, line.start + to);
    }
    return true;
  }
  if (object === "p" && vim.operator) {
    operateOnLines(view, vim, vim.operator, line.start, line.end);
    return true;
  }
  return commitReset(view, vim, {});
}

function decorations(state: EditorState, vim: VimState): DecorationSet {
  if (!enabled() || vim.mode === "insert") return DecorationSet.empty;
  const cursor = cursorOf(state, vim);
  const line = lineAt(state.doc, cursor);
  if (!line) return DecorationSet.empty;
  if (line.end === line.start) {
    return DecorationSet.create(state.doc, [
      Decoration.node(line.$pos.before(), line.$pos.after(), { class: "vim-cursor-empty" }),
    ]);
  }
  const at = Math.min(cursor, line.end - 1);
  return DecorationSet.create(state.doc, [Decoration.inline(at, at + 1, { class: "vim-cursor" })]);
}

/// Optional Vim keys in the page editor, behind the `notes.vimMode` setting: normal, insert and
/// visual modes with the common motions, operators, text objects and counts. Off, the plugin does
/// nothing and every key goes to the editor. Navigation outside the editor is not part of it.
export const VimMode = Extension.create({
  name: "vimMode",
  priority: 10_000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<VimState>({
        key,
        state: {
          init: () => INITIAL,
          apply: (tr, value) => {
            const next: VimState | undefined = tr.getMeta(key);
            return next ?? value;
          },
        },
        props: {
          attributes: (state): Record<string, string> => {
            const vim = vimState(state);
            return enabled() ? { class: `vim-${vim.mode}`, "data-vim-mode": vim.mode } : {};
          },
          decorations: (state) => decorations(state, vimState(state)),
          handleKeyDown: (view, event) => {
            if (!enabled()) return false;
            const vim = vimState(view.state);
            if (event.metaKey || event.altKey || event.isComposing) return false;
            if (vim.mode === "insert") {
              if (event.key === "Escape" || (event.ctrlKey && event.key === "[")) {
                const { selection, doc } = view.state;
                const line = lineAt(doc, selection.head);
                const at =
                  line && selection.head > line.start ? selection.head - 1 : selection.head;
                commit(view, view.state.tr.setSelection(selectionAt(doc, at)), vim, {
                  ...reset,
                  mode: "normal",
                });
                return true;
              }
              return false;
            }
            // Arrow keys, Tab, function keys and the like stay with the editor.
            if (event.key.length > 1 && !["Enter", "Backspace", "Escape"].includes(event.key)) {
              return false;
            }
            if (event.ctrlKey && !["r", "["].includes(event.key)) return false;
            return handleNormalKey(editor, view, event, vim);
          },
        },
      }),
    ];
  },
});
