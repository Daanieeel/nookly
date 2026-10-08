import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { letterListExtensions } from "#/features/notes/ordered-list-extension.ts";

const SAVE_DELAY_MS = 600;

/// A rich text editor over one markdown string, for a plain text field on an entity
/// (a Session's notes) rather than a block based page. What was stored as plain
/// text is valid markdown, so existing values open as they are. Saves shortly after
/// typing stops, and right away when the editor loses focus or goes away.
export function MarkdownEditor({
  value,
  onSave,
  placeholder,
  className,
}: {
  value: string;
  onSave: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const saved = useRef(value);
  const timer = useRef<number | undefined>(undefined);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const editor = useEditor({
    content: value,
    contentType: "markdown",
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, orderedList: false, listItem: false }),
      ...letterListExtensions,
      Markdown,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: { class: cn("tiptap-content min-h-32 text-sm/relaxed", className) },
    },
    onUpdate: ({ editor: current }) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(current.getMarkdown()), SAVE_DELAY_MS);
    },
    onBlur: ({ editor: current }) => flush(current.getMarkdown()),
  });

  function flush(markdown: string) {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (markdown === saved.current) return;
    saved.current = markdown;
    onSaveRef.current(markdown);
  }

  // Leaving inside the delay saves instead of dropping the last edits. The editor is
  // destroyed on a later tick, so it is still readable here.
  useEffect(
    () => () => {
      if (timer.current !== undefined && editor) flush(editor.getMarkdown());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <EditorContent editor={editor} />;
}
