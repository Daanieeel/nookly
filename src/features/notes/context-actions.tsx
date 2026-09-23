import {
  IconBold,
  IconClipboard,
  IconCode,
  IconCopyPlus,
  IconFileDownload,
  IconItalic,
  IconLink,
  IconMarkdown,
  IconPlus,
  IconStrikethrough,
  IconTextSize,
  IconTransform,
  IconTrash,
} from "@tabler/icons-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ChainedCommands, Editor } from "@tiptap/react";
import { labelsAction } from "@/components/context-menu/entity-actions";
import {
  type EntityRecord,
  type MenuSubItem,
  registerActions,
  registerEntityType,
} from "@/components/context-menu/registry";
import { getEntity } from "@/lib/api/entities";
import { renderPageMarkdown } from "@/lib/api/notes";
import { copyEntityLink, copyText, readClipboardText } from "@/lib/clipboard";
import { useState } from "react";
import { savePageMarkdownFile } from "./PageExportMenu";
import { SLASH_ITEMS, toListItem } from "./slash-command-extension";
import { SuggestionList } from "./suggestion-list";

declare module "@/components/context-menu/registry" {
  interface ContextTargets {
    /// One top-level block of a page, right-clicked in the editor or its gutter.
    "note.block": NoteBlockTarget;
    /// The editor's empty canvas below or beside its blocks. `overText` when that
    /// spot is still inside the editable region, which brings its own Paste.
    "note.canvas": { editor: Editor; overText: boolean };
  }
}

export interface NoteBlockTarget {
  editor: Editor;
  /// The block's client id (`UniqueBlockId`), stable while the editor is open.
  blockId: string;
  /// The page the block belongs to.
  entityId: string;
  /// Saves pending edits, then maps the client id to the stored block's id, the
  /// one links point at. `null` if the block never got saved.
  resolveStoredId: (blockId: string) => Promise<string | null>;
}

interface LocatedBlock {
  pos: number;
  node: ProseMirrorNode;
}

function locateBlock(editor: Editor, blockId: string): LocatedBlock | null {
  let found: LocatedBlock | null = null;
  editor.state.doc.forEach((node, pos) => {
    if (!found && node.attrs.blockId === blockId) found = { pos, node };
  });
  return found;
}

/// A block type existing text can turn into. `title` names its entry in
/// `SLASH_ITEMS`, whose icon and description the picker shows, so it reads
/// exactly like the "/" and gutter "+" menus.
interface BlockKind {
  title: string;
  matches: (node: ProseMirrorNode) => boolean;
  apply: (chain: ChainedCommands) => ChainedCommands;
}

const isHeading = (level: number) => (node: ProseMirrorNode) =>
  node.type.name === "heading" && node.attrs.level === level;

/// Same set and order as the slash menu, minus Table, Timeline, Progress and Tree:
/// those aren't something existing text turns into.
const BLOCK_KINDS: BlockKind[] = [
  {
    title: "Text",
    matches: (node) => node.type.name === "paragraph",
    apply: (chain) => chain.setParagraph(),
  },
  {
    title: "Heading 1",
    matches: isHeading(1),
    apply: (chain) => chain.setNode("heading", { level: 1 }),
  },
  {
    title: "Heading 2",
    matches: isHeading(2),
    apply: (chain) => chain.setNode("heading", { level: 2 }),
  },
  {
    title: "Heading 3",
    matches: isHeading(3),
    apply: (chain) => chain.setNode("heading", { level: 3 }),
  },
  {
    title: "Quote",
    matches: (node) => node.type.name === "blockquote",
    apply: (chain) => chain.toggleBlockquote(),
  },
  {
    title: "Callout",
    matches: (node) => node.type.name === "callout",
    apply: (chain) => chain.setNode("callout", { variant: "note" }),
  },
  {
    title: "Code block",
    matches: (node) => node.type.name === "codeBlock",
    apply: (chain) => chain.toggleCodeBlock(),
  },
  {
    title: "Bulleted list",
    matches: (node) => node.type.name === "bulletList",
    apply: (chain) => chain.toggleBulletList(),
  },
  {
    title: "Numbered list",
    matches: (node) => node.type.name === "orderedList",
    apply: (chain) => chain.toggleOrderedList(),
  },
];

/// Every kind with its slash menu entry; the block's current kind is left out,
/// since turning a block into what it already is does nothing.
function turnIntoOptions(node: ProseMirrorNode | undefined) {
  return BLOCK_KINDS.filter((kind) => !node || !kind.matches(node)).flatMap((kind) => {
    const slash = SLASH_ITEMS.find((item) => item.title === kind.title);
    return slash ? [{ kind, item: toListItem(slash) }] : [];
  });
}

/// The block picker itself (search field, icons, descriptions), in the popover
/// the menu leaves behind where it was opened.
function TurnIntoPicker({ target, close }: { target: NoteBlockTarget; close: () => void }) {
  const [options] = useState(() =>
    turnIntoOptions(locateBlock(target.editor, target.blockId)?.node),
  );
  return (
    <SuggestionList
      embedded
      searchable
      items={options.map((option) => option.item)}
      onSelect={(index) => {
        const option = options[index];
        close();
        if (option) turnInto(target.editor, target.blockId, option.kind);
      }}
    />
  );
}

/// Unwraps the block to plain paragraphs first, so every kind converts from
/// every other one, lists and quotes included, with all their lines. The result
/// keeps the block's id, so links to the block still land on it.
function turnInto(editor: Editor, blockId: string, kind: BlockKind) {
  const block = locateBlock(editor, blockId);
  if (!block) return;
  const chain = editor
    .chain()
    .focus()
    .setTextSelection({ from: block.pos + 1, to: block.pos + block.node.nodeSize - 1 })
    .clearNodes();
  kind
    .apply(chain)
    .command(({ tr }) => {
      const converted = tr.doc.nodeAt(block.pos);
      if (converted && "blockId" in converted.attrs) {
        tr.setNodeMarkup(block.pos, undefined, { ...converted.attrs, blockId });
      }
      return true;
    })
    .run();
}

interface InlineMark {
  id: string;
  label: string;
  icon: React.ReactNode;
  mark: string;
  toggle: (chain: ChainedCommands) => ChainedCommands;
}

const INLINE_MARKS: InlineMark[] = [
  {
    id: "bold",
    label: "Bold",
    icon: <IconBold size={14} />,
    mark: "bold",
    toggle: (c) => c.toggleBold(),
  },
  {
    id: "italic",
    label: "Italic",
    icon: <IconItalic size={14} />,
    mark: "italic",
    toggle: (c) => c.toggleItalic(),
  },
  {
    id: "strike",
    label: "Strikethrough",
    icon: <IconStrikethrough size={14} />,
    mark: "strike",
    toggle: (c) => c.toggleStrike(),
  },
  {
    id: "code",
    label: "Inline code",
    icon: <IconCode size={14} />,
    mark: "code",
    toggle: (c) => c.toggleCode(),
  },
];

function formatItems({ editor }: NoteBlockTarget): MenuSubItem[] {
  return INLINE_MARKS.map((m) => ({
    id: m.id,
    label: m.label,
    icon: m.icon,
    checked: editor.isActive(m.mark),
    run: () => {
      m.toggle(editor.chain().focus()).run();
    },
  }));
}

registerActions("note.block", [
  {
    id: "turn-into",
    group: "type",
    label: "Turn Into…",
    icon: IconTransform,
    when: ({ editor, blockId }) => {
      // Tables and the row based custom blocks hold no text to convert.
      const type = locateBlock(editor, blockId)?.node.type;
      return editor.isEditable && type !== undefined && type.name !== "table" && !type.isAtom;
    },
    run: (target, helpers) =>
      helpers.openPopover((close) => <TurnIntoPicker target={target} close={close} />),
  },
  {
    id: "format",
    group: "type",
    label: "Format",
    icon: IconTextSize,
    when: ({ editor }) => editor.isEditable && !editor.state.selection.empty,
    useItems: formatItems,
  },
  {
    id: "duplicate-block",
    group: "edit",
    label: "Duplicate Block",
    icon: IconCopyPlus,
    when: ({ editor }) => editor.isEditable,
    run: ({ editor, blockId }) => {
      const block = locateBlock(editor, blockId);
      if (!block) return;
      // `UniqueBlockId` gives the copy its own id.
      editor
        .chain()
        .insertContentAt(block.pos + block.node.nodeSize, block.node.toJSON())
        .run();
    },
  },
  {
    id: "copy-block-link",
    group: "share",
    label: "Copy Link to Block",
    icon: IconLink,
    successLabel: "Link copied",
    run: async ({ blockId, entityId, resolveStoredId }, helpers) => {
      const [storedId, entity] = await Promise.all([
        resolveStoredId(blockId),
        helpers.queryClient.fetchQuery({
          queryKey: ["entity", entityId],
          queryFn: () => getEntity(entityId),
        }),
      ]);
      if (!storedId) throw new Error("Block not saved yet");
      await copyEntityLink(entity, storedId);
    },
  },
  {
    id: "delete-block",
    group: "danger",
    label: "Delete Block",
    icon: IconTrash,
    destructive: true,
    when: ({ editor }) => editor.isEditable,
    run: ({ editor, blockId }) => {
      const block = locateBlock(editor, blockId);
      if (!block) return;
      editor.commands.deleteRange({ from: block.pos, to: block.pos + block.node.nodeSize });
    },
  },
]);

/// Puts the cursor at the end of the page, on an empty paragraph: the last block
/// when it's already empty, a new one otherwise.
function focusNewBlock(editor: Editor) {
  const last = editor.state.doc.lastChild;
  const end = editor.state.doc.content.size;
  if (last?.type.name === "paragraph" && last.content.size === 0) {
    editor
      .chain()
      .focus()
      .setTextSelection(end - 1)
      .run();
    return;
  }
  editor
    .chain()
    .insertContentAt(end, { type: "paragraph" })
    .focus()
    .setTextSelection(end + 1)
    .run();
}

registerActions("note.canvas", [
  {
    id: "new-block",
    group: "create",
    label: "New Block Here",
    icon: IconPlus,
    when: ({ editor }) => editor.isEditable,
    afterClose: true,
    run: ({ editor }) => focusNewBlock(editor),
  },
  {
    id: "paste",
    group: "edit",
    label: "Paste",
    icon: IconClipboard,
    shortcut: "⌘V",
    when: ({ editor, overText }) => editor.isEditable && !overText,
    afterClose: true,
    errorLabel: "Couldn't paste, try again",
    run: async ({ editor }) => {
      const text = await readClipboardText();
      if (!text) return;
      focusNewBlock(editor);
      editor.view.pasteText(text);
    },
  },
]);

// --- Pages (Notes and Jots) as entities -------------------------------------

registerEntityType<EntityRecord>({
  types: ["note", "jot"],
  actions: [
    labelsAction(),
    {
      id: "copy-markdown",
      group: "share",
      label: "Copy as Markdown",
      icon: IconMarkdown,
      successLabel: "Markdown copied",
      run: async ({ entity }) => copyText(await renderPageMarkdown(entity.id)),
    },
    {
      id: "save-markdown",
      group: "share",
      label: "Save as Markdown File…",
      icon: IconFileDownload,
      run: ({ entity }) => savePageMarkdownFile(entity),
    },
  ],
});
