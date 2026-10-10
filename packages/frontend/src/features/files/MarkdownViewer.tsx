import { Markdown } from "@tiptap/markdown";
import { cn } from "@nookly/ui/lib/utils";
import { EditorContent, useEditor } from "@tiptap/react";
import { openLink } from "#/features/notes/open-link.ts";
import { editorExtensions } from "#/features/notes/editor-extensions.ts";

/// A markdown file drawn by the note editor's own renderer, read only: the same
/// headings, lists, tables, task lists and highlighted code as a Note.
export function MarkdownViewer({
  text,
  spaceId,
  className,
}: {
  text: string;
  spaceId: string;
  /// Added to the content, to size the text (`text-xs`) where it is not a page of its own.
  className?: string;
}) {
  const editor = useEditor({
    content: text,
    contentType: "markdown",
    editable: false,
    extensions: [...editorExtensions({ spaceId, pageId: "", getEntities: () => [] }), Markdown],
    editorProps: {
      attributes: { class: cn("tiptap-content text-sm/relaxed", className) },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => openLink(event, spaceId),
    },
  });
  return <EditorContent editor={editor} />;
}
