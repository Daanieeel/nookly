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
export const SLASH_GROUPS = [
  "Text",
  "Lists",
  "Data",
  "Math and diagrams",
  "Links and media",
] as const;

export interface SlashItem {
  id: string;
  label: string;
  /// One line under the name, the desktop's words.
  description: string;
  group: (typeof SLASH_GROUPS)[number];
  keywords: string[];
  run: Command;
}

/// Where a block that is not text goes: in place of the empty paragraph the command was typed
/// in, else after the top level block that holds the cursor. A paragraph at the end of the page
/// follows it, so the cursor has somewhere to go on.
function insertBlock(make: () => Node): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if ($from.depth < 1) return false;
    const replace =
      $from.depth === 1 && $from.parent.type === nodes.paragraph && $from.parent.content.size === 0;
    const start = replace ? $from.before(1) : $from.after(1);
    const end = replace ? $from.after(1) : start;
    const block = make();
    const last = end >= state.doc.content.size;
    const content = last || replace ? [block, nodes.paragraph.create()] : [block];
    if (!dispatch) return true;
    const tr = state.tr.replaceWith(start, end, content);
    // The cursor goes into a block that holds text, else on to the paragraph after it.
    const inside = block.isTextblock ? start + 1 : start + block.nodeSize + 1;
    dispatch(
      tr
        .setSelection(TextSelection.near(tr.doc.resolve(Math.min(inside, tr.doc.content.size))))
        .scrollIntoView(),
    );
    return true;
  };
}

/// A block of text that holds a source (an equation, a diagram): the empty paragraph turns
/// into it, and a paragraph with words keeps them, the block following it.
function sourceBlock(type: NodeType): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if (
      $from.depth === 1 &&
      $from.parent.type === nodes.paragraph &&
      $from.parent.content.size === 0
    ) {
      return setBlock(type, {})(state, dispatch);
    }
    return insertBlock(() => type.create())(state, dispatch);
  };
}

/// A block whose rows are typed in its card (Steps, Tree, Image): empty to begin with.
const rowBlock = (type: NodeType, rows = ""): Command => insertBlock(() => type.create({ rows }));

/// A grid of three by three cells, its first row the header.
function threeByThree(): Node {
  const row = (cell: NodeType) =>
    nodes.tableRow.create(
      null,
      [0, 1, 2].map(() => cell.create(null, nodes.paragraph.create())),
    );
  return nodes.table.create(null, [
    row(nodes.tableHeader),
    row(nodes.tableCell),
    row(nodes.tableCell),
  ]);
}

/// The paragraph the command was typed in becomes a toggle holding its text.
const insertToggle: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth !== 1 || $from.parent.type !== nodes.paragraph) return false;
  const start = $from.before(1);
  const paragraph = nodes.paragraph.create(null, $from.parent.content);
  const toggle = nodes.toggle.create({ toggle: "open" }, paragraph);
  if (!dispatch) return true;
  const tr = state.tr.replaceWith(start, $from.after(1), toggle);
  dispatch(
    tr
      .setSelection(TextSelection.create(tr.doc, start + 2 + $from.parent.content.size))
      .scrollIntoView(),
  );
  return true;
};

/// What typed text after this will be: marked with the highlighter, as the desktop's item.
const startHighlight: Command = (state, dispatch) => {
  dispatch?.(state.tr.addStoredMark(marks.highlight.create()));
  return true;
};

/// A formula inside the text, empty, to be filled in.
const insertInlineMath: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(nodes.inlineMath.create({ latex: "" }), false));
  return true;
};

/// Empties a paragraph and puts a divider in its place, with a new paragraph after.
const insertDivider: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.parent.type !== nodes.paragraph || $from.depth !== 1) return false;
  return insertBlock(() => nodes.divider.create())(state, dispatch);
};

const item = (
  id: string,
  label: string,
  description: string,
  group: SlashItem["group"],
  keywords: string[],
  run: Command,
): SlashItem => ({ id, label, description, group, keywords, run });

const heading = (level: number, label: string, description: string, keywords: string[]) =>
  item(`h${level}`, label, description, "Text", keywords, toggleHeadingOn(level));

/// The desktop's block menu (`SLASH_ITEMS`): every block, in the same words and order.
export const SLASH_ITEMS: SlashItem[] = [
  item(
    "text",
    "Text",
    "Plain paragraph",
    "Text",
    ["paragraph", "plain"],
    setBlock(nodes.paragraph, {}),
  ),
  item(
    "highlight",
    "Highlight",
    "Mark text with a highlighter, or type ==",
    "Text",
    ["mark", "marker", "highlighter", "==", "color", "colour"],
    startHighlight,
  ),
  heading(1, "Heading 1", "Big section heading", ["h1", "title", "header"]),
  heading(2, "Heading 2", "Medium section heading", ["h2", "subtitle", "header"]),
  heading(3, "Heading 3", "Small section heading", ["h3", "subheading", "header"]),
  heading(4, "Heading 4", "Minor section heading", ["h4", "header"]),
  heading(5, "Heading 5", "Smaller section heading", ["h5", "header"]),
  heading(6, "Heading 6", "Smallest section heading", ["h6", "header"]),
  item(
    "toggleHeading",
    "Toggle heading",
    "A heading that folds its section",
    "Text",
    [],
    setBlock(nodes.heading, { level: 2, toggle: "open" }),
  ),
  item("toggle", "Toggle", "A line that folds text under it", "Text", [], insertToggle),
  item("quote", "Quote", "Capture a quote", "Text", ["blockquote"], toggleQuote),
  item(
    "callout",
    "Callout",
    "An aside that stands out",
    "Text",
    ["note", "info", "warning"],
    setBlock(nodes.callout, { variant: "note" }),
  ),
  item(
    "divider",
    "Divider",
    "A line between sections",
    "Text",
    ["line", "rule", "separator"],
    insertDivider,
  ),
  item(
    "code",
    "Code block",
    "A block of preformatted code",
    "Text",
    ["code", "snippet"],
    setBlockType(nodes.codeBlock),
  ),
  item(
    "bullets",
    "Bulleted list",
    "A simple bulleted list",
    "Lists",
    ["list", "ul", "bullet"],
    toggleBullets,
  ),
  item(
    "numbers",
    "Numbered list",
    "A list with numbering",
    "Lists",
    ["list", "ol", "number"],
    toggleNumbers,
  ),
  item(
    "tasks",
    "Checklist",
    "Items to tick off",
    "Lists",
    ["todo", "task", "checkbox"],
    toggleTasks,
  ),
  item("steps", "Steps", "A procedure, one step at a time", "Lists", [], rowBlock(nodes.steps)),
  item("tree", "Tree", "A nested outline with branches", "Lists", [], rowBlock(nodes.tree)),
  item("table", "Table", "A 3x3 grid of cells", "Data", [], insertBlock(threeByThree)),
  item("details", "Details", "Labels and values at a glance", "Data", [], rowBlock(nodes.details)),
  item("stats", "Stats", "Headline numbers side by side", "Data", [], rowBlock(nodes.stats)),
  item(
    "progress",
    "Progress",
    "Goals tracked against a target",
    "Data",
    [],
    rowBlock(nodes.progress, "\t0\t10"),
  ),
  item(
    "timeline",
    "Timeline",
    "Dated events on a rail",
    "Data",
    [],
    rowBlock(nodes.timeline, "\t"),
  ),
  item(
    "equation",
    "Equation",
    "One LaTeX formula, centered",
    "Math and diagrams",
    [],
    sourceBlock(nodes.equation),
  ),
  item(
    "math",
    "Math block",
    "Lines of LaTeX for derivations and proofs",
    "Math and diagrams",
    [],
    sourceBlock(nodes.math),
  ),
  item(
    "inlineMath",
    "Inline math",
    "A formula inside the text, or type $x$",
    "Math and diagrams",
    [],
    insertInlineMath,
  ),
  item(
    "diagram",
    "Diagram",
    "Flowcharts and more with Mermaid",
    "Math and diagrams",
    [],
    sourceBlock(nodes.diagram),
  ),
  item(
    "circuit",
    "Circuit",
    "Logic gates from a boolean expression, or drawn by hand",
    "Math and diagrams",
    [],
    sourceBlock(nodes.circuit),
  ),
  item(
    "plot",
    "Plot",
    "Functions and points in a coordinate system",
    "Math and diagrams",
    [],
    sourceBlock(nodes.plot),
  ),
  item(
    "mindmap",
    "Mind map",
    "Ideas branching from a topic, from an indented list",
    "Math and diagrams",
    [],
    sourceBlock(nodes.mindmap),
  ),
  item("image", "Image", "Upload or link a picture", "Links and media", [], rowBlock(nodes.image)),
  item("video", "Video", "Play a video file or link", "Links and media", [], rowBlock(nodes.video)),
  item("audio", "Audio", "A recording or a song", "Links and media", [], rowBlock(nodes.audio)),
  item(
    "file",
    "File",
    "Attach any file to open later",
    "Links and media",
    [],
    rowBlock(nodes.file),
  ),
  item(
    "bookmark",
    "Web bookmark",
    "A preview card for a link",
    "Links and media",
    [],
    rowBlock(nodes.bookmark),
  ),
  item(
    "embed",
    "Embed",
    "YouTube, Figma, Maps and more, inline",
    "Links and media",
    [],
    rowBlock(nodes.embed),
  ),
  item(
    "linked",
    "Linked item",
    "A live card for a task, exam, course or page",
    "Links and media",
    [],
    rowBlock(nodes.entity_card),
  ),
];

function toggleHeadingOn(level: number): Command {
  return setBlock(nodes.heading, { level });
}

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9=]/g, "");

/// How well a name matches what was typed: starting with it, then containing it, then having
/// its letters in order ("inlmath"); -1 for no match. Hyphens and spaces do not count, so
/// `inline-math` finds Inline math.
function rank(name: string, typed: string): number {
  const text = plain(name);
  if (text.startsWith(typed)) return 0;
  if (text.includes(typed)) return 1;
  let at = 0;
  for (const letter of typed) {
    at = text.indexOf(letter, at) + 1;
    if (at === 0) return -1;
  }
  return 2;
}

/// The menu's items for what has been typed after the slash, the best matches first.
export function slashMatches(query: string): SlashItem[] {
  const typed = plain(query);
  if (!typed) return SLASH_ITEMS;
  return SLASH_ITEMS.map((entry, index) => {
    const ranks = [entry.label, ...entry.keywords]
      .map((name) => rank(name, typed))
      .filter((r) => r >= 0);
    return { entry, index, best: ranks.length > 0 ? Math.min(...ranks) : -1 };
  })
    .filter((found) => found.best >= 0)
    .toSorted((a, b) => a.best - b.best || a.index - b.index)
    .map((found) => found.entry);
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
  // What is typed next takes the highlighter, for that item.
  if (made[0].storedMarksSet) combined.setStoredMarks(made[0].storedMarks);
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
