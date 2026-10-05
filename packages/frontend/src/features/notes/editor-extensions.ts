import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Entity } from "#/lib/api/types.ts";
import { ArrowLigatures } from "./arrow-ligatures";
import { BlockSelection } from "./block-selection";
import { CodeBlockWithHeader } from "./code-block-extension";
import { CodeCompletion } from "./code-completion-extension";
import {
  Audio,
  Callout,
  Details,
  Divider,
  Embed,
  EntityCard,
  FileBlock,
  Image,
  Progress,
  Stats,
  Steps,
  Timeline,
  Tree,
  Video,
  WebBookmark,
} from "./custom-block-extensions";
import { HeadingAnchors } from "./heading-anchors";
import { InlineMath } from "./InlineMath";
import { Mention } from "./mention-extension";
import { SlashCommand } from "./slash-command-extension";
import { CircuitBlock, Diagram, Equation, MathBlock } from "./source-block-extensions";
import { Toggle, ToggleHeading } from "./toggle-extension";
import { UniqueBlockId } from "./unique-block-id";

export interface EditorExtensionOptions {
  spaceId: string;
  /// The page being edited.
  pageId: string;
  /// Read live, so mentions and the "/" menu see entities loaded after the editor.
  getEntities: () => Entity[];
}

/// Every extension of the page editor, in one place so tests build the very same schema.
export function editorExtensions({
  spaceId,
  pageId,
  getEntities,
}: EditorExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: false,
        protocols: [{ scheme: "mention", optionalSlashes: true }],
      },
      // Replaced by a dedicated `CodeBlockLowlight` extension below for syntax highlighting.
      codeBlock: false,
      // Replaced by `Divider`, the same rule saved as a `divider` block.
      horizontalRule: false,
    }),
    CodeBlockWithHeader.configure({ defaultLanguage: "plaintext" }),
    Placeholder.configure({ placeholder: "Type “/” for commands, or just start writing…" }),
    TableKit.configure({ table: { resizable: true } }),
    UniqueBlockId,
    HeadingAnchors,
    ArrowLigatures,
    BlockSelection,
    SlashCommand.configure({ getEntities }),
    CodeCompletion,
    Mention.configure({ getEntities }),
    Callout,
    Timeline,
    Progress,
    Tree,
    Steps,
    Stats,
    Details,
    Divider,
    TaskList,
    // One level only: a checklist block stores one item per line.
    TaskItem.configure({ nested: false }),
    Toggle,
    ToggleHeading,
    InlineMath,
    Equation,
    MathBlock,
    Diagram,
    CircuitBlock,
    EntityCard.configure({ spaceId, pageId }),
    Image.configure({ spaceId }),
    Video.configure({ spaceId }),
    Audio.configure({ spaceId }),
    FileBlock.configure({ spaceId }),
    Embed,
    WebBookmark.configure({ spaceId }),
  ];
}
