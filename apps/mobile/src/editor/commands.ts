import { toggleMark, wrapIn } from "prosemirror-commands";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Attrs, MarkType, Node, NodeType } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { type Command, type EditorState, Plugin, PluginKey } from "prosemirror-state";
import { z } from "zod";
import { pageSchema as schema } from "./schema.ts";

/// What the editor's toolbar and keys do, on the page schema.

const { nodes, marks } = schema;

/// Top level nodes that become a block row, each needing an id of its own.
const TOP_LEVEL = new Set(
  Object.values(nodes)
    .filter((n) => n.isInGroup("block") && n.name !== "doc")
    .map((n) => n.name),
);

const blockId = z.string().min(1).nullable();
const newBlockId = () => `blk_${Math.random().toString(36).slice(2, 11)}`;

/// One id per top level block, as on the desktop: a block made by pressing Enter
/// carries its sibling's id at first, so the later one of a pair gets a fresh one.
export const blockIds = new Plugin({
  key: new PluginKey("blockIds"),
  appendTransaction(transactions, _old, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    let tr = state.tr;
    let changed = false;
    const seen = new Set<string>();
    state.doc.forEach((node: Node, pos: number) => {
      if (!TOP_LEVEL.has(node.type.name)) return;
      const current = blockId.catch(null).parse(node.attrs.blockId);
      if (!current || seen.has(current)) {
        const id = newBlockId();
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id });
        seen.add(id);
        changed = true;
      } else {
        seen.add(current);
      }
    });
    return changed ? tr : null;
  },
});

const mark = (type: MarkType): Command => toggleMark(type);

export const toggleBold = mark(marks.bold);
export const toggleItalic = mark(marks.italic);
export const toggleUnderline = mark(marks.underline);
export const toggleStrike = mark(marks.strike);
export const toggleCode = mark(marks.code);

/// The block the selection is in, from the inside out.
function inside(state: EditorState, name: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) return true;
  }
  return false;
}

/// Turns the text blocks of the selection into `type`, each keeping its block id.
function setBlock(type: NodeType, attrs: Attrs): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    let tr = state.tr;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (!node.type.validContent(node.content) && type.name !== node.type.name) return false;
      tr = tr.setNodeMarkup(pos, type, { blockId: node.attrs.blockId ?? null, ...attrs });
      changed = true;
      return false;
    });
    if (!changed) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/// Makes the block a heading of `level`, or a paragraph again when it already is one.
export function toggleHeading(level: number): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const same = $from.parent.type === nodes.heading && $from.parent.attrs.level === level;
    return same
      ? setBlock(nodes.paragraph, {})(state, dispatch)
      : setBlock(nodes.heading, { level })(state, dispatch);
  };
}

/// Wraps the block in a list of `list`, or takes it out when it is in one already.
function toggleList(list: typeof nodes.bulletList, item: typeof nodes.listItem): Command {
  return (state, dispatch) =>
    inside(state, list.name)
      ? liftListItem(item)(state, dispatch)
      : wrapInList(list)(state, dispatch);
}

export const toggleBullets = toggleList(nodes.bulletList, nodes.listItem);
export const toggleNumbers = toggleList(nodes.orderedList, nodes.listItem);
export const toggleTasks = toggleList(nodes.taskList, nodes.taskItem);

/// Wraps the block in a quote, or lifts it out of one.
export const toggleQuote: Command = (state, dispatch) => {
  if (!inside(state, "blockquote")) return wrapIn(nodes.blockquote)(state, dispatch);
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, (n) => n.type === nodes.blockquote);
  if (!range) return false;
  dispatch?.(state.tr.lift(range, range.depth - 1).scrollIntoView());
  return true;
};

/// Indents the list item the selection is in, or takes it back out.
const listItems = [nodes.listItem, nodes.taskItem];
export const indent: Command = (state, dispatch) =>
  listItems.some((item) => sinkListItem(item)(state, dispatch));
export const outdent: Command = (state, dispatch) =>
  listItems.some((item) => liftListItem(item)(state, dispatch));

export const enter: Command = (state, dispatch) =>
  listItems.some((item) => splitListItem(item)(state, dispatch));

/// Which formatting is on at the selection, for the toolbar.
export function active(state: EditorState) {
  const { from, $from, to, empty } = state.selection;
  const has = (type: MarkType) =>
    empty
      ? Boolean(type.isInSet(state.storedMarks ?? $from.marks()))
      : state.doc.rangeHasMark(from, to, type);
  return {
    bold: has(marks.bold),
    italic: has(marks.italic),
    underline: has(marks.underline),
    strike: has(marks.strike),
    code: has(marks.code),
    heading: $from.parent.type === nodes.heading ? Number($from.parent.attrs.level) : 0,
    bullets: inside(state, "bulletList"),
    numbers: inside(state, "orderedList"),
    tasks: inside(state, "taskList"),
    quote: inside(state, "blockquote"),
  };
}

/// Markdown as it is typed: `# `, `- `, `1. `, `[] `, `> `, three backticks.
export const markdownRules = inputRules({
  rules: [
    textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({ level: match[1].length })),
    wrappingInputRule(/^\s*([-+*])\s$/, nodes.bulletList),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      nodes.orderedList,
      (match) => ({ start: Number(match[1]) }),
      (match, node) => node.childCount + Number(node.attrs.start) === Number(match[1]),
    ),
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    textblockTypeInputRule(/^```$/, nodes.codeBlock),
    new InputRule(/^\s*\[([ x])?\]\s$/, (state, match, start, end) => {
      const tr = state.tr.delete(start, end);
      const $start = tr.doc.resolve(start);
      const blockRange = $start.blockRange();
      if (!blockRange) return null;
      return tr
        .wrap(blockRange, [
          { type: nodes.taskList },
          { type: nodes.taskItem, attrs: { checked: match[1] === "x" } },
        ])
        .scrollIntoView();
    }),
  ],
});

export const typingKeys = keymap({
  Enter: enter,
  Tab: indent,
  "Shift-Tab": outdent,
  "Mod-b": toggleBold,
  "Mod-i": toggleItalic,
  "Mod-u": toggleUnderline,
  "Mod-e": toggleCode,
});
