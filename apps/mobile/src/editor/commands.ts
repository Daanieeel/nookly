import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Attrs, MarkType, Node, NodeType } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
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
const toggleUnderline = mark(marks.underline);
export const toggleStrike = mark(marks.strike);
export const toggleCode = mark(marks.code);
export const toggleHighlight = mark(marks.highlight);

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

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

/// The list the cursor is in, nearest first, and where it starts.
function listAround(state: EditorState): { node: Node; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (LISTS.has(node.type.name)) return { node, pos: $from.before(depth) };
  }
  return null;
}

/// Wraps the block in a list of `list`, takes it out when it is in that kind already, or
/// turns the list it is in into this kind (bullets into numbers, into tasks), items, text
/// and cursor kept.
function toggleList(list: typeof nodes.bulletList, item: typeof nodes.listItem): Command {
  return (state, dispatch) => {
    const around = listAround(state);
    if (!around) return wrapInList(list)(state, dispatch);
    if (around.node.type === list) return liftListItem(item)(state, dispatch);
    if (dispatch) {
      const items: Node[] = [];
      around.node.forEach((child) =>
        items.push(
          child.type === item
            ? child
            : item.create(
                item === nodes.taskItem ? { checked: false } : null,
                child.content,
                child.marks,
              ),
        ),
      );
      const { from, to } = state.selection;
      const tr = state.tr.replaceWith(
        around.pos,
        around.pos + around.node.nodeSize,
        list.create(around.node.attrs, items),
      );
      // The items wrap their text the same way, so the text keeps its place.
      tr.setSelection(TextSelection.create(tr.doc, from, to));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
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
    highlight: has(marks.highlight),
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

/// Flips the check of the task item the position is in. False when it isn't in one.
export function toggleTaskAt(state: EditorState, pos: number): Transaction | null {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type === nodes.taskItem) {
      return state.tr.setNodeMarkup($pos.before(depth), undefined, {
        ...node.attrs,
        checked: !node.attrs.checked,
      });
    }
  }
  return null;
}

// --- the slash menu and mentions ------------------------------------------------------

/// What is being typed that opens a menu: `/heading` for blocks, `@ada` for an item to
/// mention. `from` and `to` bound the typed text, trigger included, to be replaced.
export interface Trigger {
  kind: "slash" | "mention";
  query: string;
  from: number;
  to: number;
}

export function triggerAt(state: EditorState): Trigger | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type === nodes.codeBlock) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const found = /(?:^|\s)([/@])([^\s/@]{0,30})$/.exec(before);
  if (!found) return null;
  // A slash opens the block menu only at the start of a block, or after a space.
  const typed = found[1] + found[2];
  return {
    kind: found[1] === "/" ? "slash" : "mention",
    query: found[2],
    from: $from.pos - typed.length,
    to: $from.pos,
  };
}

/// The block menu's groups, in the desktop's order.
export const SLASH_GROUPS = ["Text", "Lists"] as const;

export interface SlashItem {
  id: string;
  label: string;
  /// One line under the name, the desktop's words.
  description: string;
  group: (typeof SLASH_GROUPS)[number];
  keywords: string[];
  run: Command;
}

/// Empties a paragraph and puts a divider in its place, with a new paragraph after.
const insertDivider: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.parent.type !== nodes.paragraph || $from.depth !== 1) return false;
  const start = $from.before(1);
  const end = $from.after(1);
  dispatch?.(
    state.tr
      .replaceWith(start, end, [nodes.divider.create(), nodes.paragraph.create()])
      .scrollIntoView(),
  );
  return true;
};

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    description: "Plain paragraph",
    group: "Text",
    keywords: ["paragraph", "plain"],
    run: setBlock(nodes.paragraph, {}),
  },
  {
    id: "h1",
    label: "Heading 1",
    description: "Big section heading",
    group: "Text",
    keywords: ["title", "h1", "large"],
    run: toggleHeadingOn(1),
  },
  {
    id: "h2",
    label: "Heading 2",
    description: "Medium section heading",
    group: "Text",
    keywords: ["h2", "medium"],
    run: toggleHeadingOn(2),
  },
  {
    id: "h3",
    label: "Heading 3",
    description: "Small section heading",
    group: "Text",
    keywords: ["h3", "small"],
    run: toggleHeadingOn(3),
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quote",
    group: "Text",
    keywords: ["blockquote"],
    run: toggleQuote,
  },
  {
    id: "callout",
    label: "Callout",
    description: "An aside that stands out",
    group: "Text",
    keywords: ["note", "info", "warning"],
    run: setBlock(nodes.callout, {}),
  },
  {
    id: "divider",
    label: "Divider",
    description: "A line between sections",
    group: "Text",
    keywords: ["line", "rule", "separator"],
    run: insertDivider,
  },
  {
    id: "code",
    label: "Code block",
    description: "A block of preformatted code",
    group: "Text",
    keywords: ["code", "snippet"],
    run: setBlockType(nodes.codeBlock),
  },
  {
    id: "bullets",
    label: "Bulleted list",
    description: "A simple bulleted list",
    group: "Lists",
    keywords: ["list", "ul", "bullet"],
    run: toggleBullets,
  },
  {
    id: "numbers",
    label: "Numbered list",
    description: "A list with numbering",
    group: "Lists",
    keywords: ["list", "ol", "number"],
    run: toggleNumbers,
  },
  {
    id: "tasks",
    label: "Checklist",
    description: "Items to tick off",
    group: "Lists",
    keywords: ["todo", "check", "checkbox", "task"],
    run: toggleTasks,
  },
];

function toggleHeadingOn(level: number): Command {
  return setBlock(nodes.heading, { level });
}

/// The menu's items for what has been typed after the slash.
export function slashMatches(query: string): SlashItem[] {
  const words = query.trim().toLowerCase();
  if (!words) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(words) || item.keywords.some((k) => k.startsWith(words)),
  );
}

/// The matches for what has been typed, under their groups' headings.
export function slashGroups(query: string) {
  const found = slashMatches(query);
  return SLASH_GROUPS.map((group) => ({
    group,
    items: found.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0);
}

/// Puts the chosen block in place of what was typed after the slash.
export function applySlash(
  state: EditorState,
  trigger: Trigger,
  item: SlashItem,
): Transaction | null {
  const cleared = state.apply(state.tr.delete(trigger.from, trigger.to));
  const made: Transaction[] = [];
  const ran = item.run(cleared, (tr) => {
    made.push(tr);
  });
  if (!ran || made.length === 0) return null;
  // The deletion and the block change are one step for undo.
  const combined = state.tr.delete(trigger.from, trigger.to);
  for (const step of made[0].steps) combined.step(step);
  return combined;
}

/// Writes a mention in place of what was typed after the `@`: the item's title as a link
/// to `mention:<id>`, the way every other client writes one, and a space after it.
export function applyMention(
  state: EditorState,
  trigger: Trigger,
  item: { id: string; title: string },
): Transaction {
  const label = item.title.trim() || "Untitled";
  const link = marks.link.create({ href: `mention:${item.id}` });
  const text = schema.text(label, [link]);
  return state.tr.replaceWith(trigger.from, trigger.to, [text, schema.text(" ")]).scrollIntoView();
}

/// A tap in the blank space under the text: the cursor goes to the empty line at the end,
/// added when the last block holds something, so nobody has to find the end of the page.
export const toNextFreeLine: Command = (state, dispatch) => {
  const last = state.doc.lastChild;
  const free = last?.type === nodes.paragraph && last.content.size === 0;
  let tr = state.tr;
  if (!free) tr = tr.insert(state.doc.content.size, nodes.paragraph.create());
  const end = tr.doc.content.size - 1;
  dispatch?.(tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView());
  return true;
};
