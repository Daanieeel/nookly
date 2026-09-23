import {
  IconBinaryTree,
  IconBookmark,
  IconCode,
  IconChevronRight,
  IconHeading,
  IconInfoCircle,
  IconMovie,
  IconMusic,
  IconPaperclip,
  IconPhoto,
  IconLink,
  IconMathFunction,
  IconMathXDivideY2,
  IconSchema,
  IconSum,
  IconSeparatorHorizontal,
  IconSquareCheck,
  IconListCheck,
  IconListDetails,
  IconNumber,
  IconProgress,
  IconTimeline,
  IconWorld,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconLetterCase,
  IconQuote,
  IconTable,
} from "@tabler/icons-react";
import { PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionListItem } from "./suggestion-list";
import { allowOutsideCode, createSuggestionRender } from "./suggestion-render";

interface SlashItem {
  title: string;
  /// Heading in the "/" and "+" menus; items of a group stay adjacent.
  group: "Text" | "Lists" | "Data" | "Math and diagrams" | "Links and media";
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
    title: "Toggle heading",
    group: "Text",
    description: "A heading that folds its section",
    icon: <IconHeading size={15} />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2, toggle: "open" })
        .run(),
  },
  {
    title: "Toggle",
    group: "Text",
    description: "A line that folds text under it",
    icon: <IconChevronRight size={15} />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .command(({ tr, state }) => {
          const { $from } = tr.selection;
          const paragraph = $from.parent;
          const toggle = state.schema.nodes.toggle.create({ toggle: "open" }, [
            state.schema.nodes.paragraph.create(null, paragraph.content),
          ]);
          const pos = $from.before();
          tr.replaceWith(pos, $from.after(), toggle);
          tr.setSelection(TextSelection.create(tr.doc, pos + 2 + paragraph.content.size));
          return true;
        })
        .run(),
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
    title: "Checklist",
    group: "Lists",
    description: "Items to tick off",
    icon: <IconSquareCheck size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
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
  {
    title: "Equation",
    group: "Math and diagrams",
    description: "One LaTeX formula, centered",
    icon: <IconMathFunction size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("equation").run(),
  },
  {
    title: "Math block",
    group: "Math and diagrams",
    description: "Lines of LaTeX for derivations and proofs",
    icon: <IconSum size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("math").run(),
  },
  {
    title: "Inline math",
    group: "Math and diagrams",
    description: "A formula inside the text, or type $x$",
    icon: <IconMathXDivideY2 size={15} />,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "inlineMath", attrs: { latex: "" } })
        .run(),
  },
  {
    title: "Diagram",
    group: "Math and diagrams",
    description: "Flowcharts and more with Mermaid",
    icon: <IconSchema size={15} />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("diagram").run(),
  },
  {
    title: "Image",
    group: "Links and media",
    description: "Upload or link a picture",
    icon: <IconPhoto size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "image", ""),
  },
  {
    title: "Video",
    group: "Links and media",
    description: "Play a video file or link",
    icon: <IconMovie size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "video", ""),
  },
  {
    title: "Audio",
    group: "Links and media",
    description: "A recording or a song",
    icon: <IconMusic size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "audio", ""),
  },
  {
    title: "File",
    group: "Links and media",
    description: "Attach any file to open later",
    icon: <IconPaperclip size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "file", ""),
  },
  {
    title: "Web bookmark",
    group: "Links and media",
    description: "A preview card for a link",
    icon: <IconBookmark size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "bookmark", ""),
  },
  {
    title: "Embed",
    group: "Links and media",
    description: "YouTube, Figma, Maps and more, inline",
    icon: <IconWorld size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "embed", ""),
  },
  {
    title: "Linked item",
    group: "Links and media",
    description: "A live card for a task, exam, course or page",
    icon: <IconLink size={15} />,
    run: (editor, range) => insertRowBlock(editor, range, "entity_card", ""),
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
