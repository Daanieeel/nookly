import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { openExternalLink } from "#/features/notes/open-link.ts";
import { editorExtensions } from "#/features/notes/editor-extensions.ts";

/// A markdown file drawn by the note editor's own renderer, read only: the same
/// headings, lists, tables, task lists and highlighted code as a Note.
export function MarkdownViewer({ text, spaceId }: { text: string; spaceId: string }) {
  const editor = useEditor({
    content: text,
    contentType: "markdown",
    editable: false,
    extensions: [...editorExtensions({ spaceId, pageId: "", getEntities: () => [] }), Markdown],
    editorProps: {
      attributes: { class: "tiptap-content text-sm/relaxed" },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => openExternalLink(event),
    },
  });
  return <EditorContent editor={editor} />;
}
