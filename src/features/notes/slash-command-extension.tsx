import {
  IconBinaryTree,
  IconCode,
  IconInfoCircle,
  IconSeparatorHorizontal,
  IconListCheck,
  IconListDetails,
  IconNumber,
  IconProgress,
  IconTimeline,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconLetterCase,
  IconQuote,
  IconTable,
} from "@tabler/icons-react";
import { PluginKey } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionListItem } from "./suggestion-list";
import { allowOutsideCode, createSuggestionRender } from "./suggestion-render";

interface SlashItem {
  title: string;
  /// Heading in the "/" and "+" menus; items of a group stay adjacent.
  group: "Text" | "Lists" | "Data";
  description: string;
  icon: React.ReactNode;
  run: (editor: Editor, range: Range) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Text",
    group: "Text",
    description: "Plain paragraph",
    icon: <IconLetterCase size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Heading 1",
    group: "Text",
    description: "Big section heading",
    icon: <IconH1 size={15} />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    group: "Text",
    description: "Medium section heading",
    icon: <IconH2 size={15} />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    group: "Text",
    description: "Small section heading",
    icon: <IconH3 size={15} />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Quote",
    group: "Text",
    description: "Capture a quote",
    icon: <IconQuote size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Callout",
    group: "Text",
    description: "An aside that stands out",
    icon: <IconInfoCircle size={15} />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("callout", { variant: "note" }).run(),
  },
  {
    title: "Divider",
    group: "Text",
    description: "A line between sections",
    icon: <IconSeparatorHorizontal size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Code block",
    group: "Text",
    description: "A block of preformatted code",
    icon: <IconCode size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Bulleted list",
    group: "Lists",
    description: "A simple bulleted list",
    icon: <IconList size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    group: "Lists",
    description: "A list with numbering",
    icon: <IconListNumbers size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Steps",
    group: "Lists",
    description: "A procedure, one step at a time",
    icon: <IconListCheck size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "steps", ""),
  },
  {
    title: "Tree",
    group: "Lists",
    description: "A nested outline with branches",
    icon: <IconBinaryTree size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "tree", ""),
  },
  {
    title: "Table",
    group: "Data",
    description: "A 3x3 grid of cells",
    icon: <IconTable size={15} />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Details",
    group: "Data",
    description: "Labels and values at a glance",
    icon: <IconListDetails size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "details", ""),
  },
  {
    title: "Stats",
    group: "Data",
    description: "Headline numbers side by side",
    icon: <IconNumber size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "stats", ""),
  },
  {
    title: "Progress",
    group: "Data",
    description: "Goals tracked against a target",
    icon: <IconProgress size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "progress", "\t0\t10"),
  },
  {
    title: "Timeline",
    group: "Data",
    description: "Dated events on a rail",
    icon: <IconTimeline size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "timeline", "\t"),
  },
];

/// Replaces the (usually empty) block the command was typed in with a row block,
/// then moves focus into its first input.
function insertRowBlock(editor: Editor, range: Range, type: string, rows: string) {
  const { from } = range;
  editor.chain().focus().deleteRange(range).insertContent({ type, attrs: { rows } }).run();
  requestAnimationFrame(() => {
    const dom = editor.view.nodeDOM(Math.max(0, from - 1));
    const target = dom instanceof HTMLElement ? dom : null;
    const input = target?.querySelector<HTMLInputElement>('input[data-row="0"]');
    input?.focus();
  });
}

export function toListItem(item: SlashItem): SuggestionListItem {
  return {
    key: item.title,
    icon: item.icon,
    label: item.title,
    description: item.description,
    group: item.group,
  };
}

/// Typing "/" opens the block-type menu (§ notes rewrite) — the same picker a
/// Notion page uses to turn the current (usually empty) block into another type.
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        allowedPrefixes: null,
        allow: allowOutsideCode,
        items: ({ query }) =>
          SLASH_ITEMS.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: createSuggestionRender(toListItem),
      }),
    ];
  },
});
