import { useQuery } from "@tanstack/react-query";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { listEntities } from "#/lib/api/entities.ts";
import { qk } from "#/lib/query-keys.ts";
import { trackActiveEditor } from "#/lib/active-editor.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { BlockInput, JSONNode } from "./block-markdown";
import { draftBlocks } from "./draft-blocks";
import { editorExtensions } from "./editor-extensions";
import { HighlightColorBar } from "./HighlightColorBar";
import { openLink } from "./open-link";
import { applyPageTypography } from "./page-typography";
import { usePasteFiles } from "./paste-files";
import { TableControls } from "./TableControls";
import { TextColorBar } from "./TextColorBar";

/// Cmd or Ctrl and Enter belong to the dialog around the editor (it creates). Without
/// this the editor would turn them into a line break as well.
const LeaveSubmitToHost = Extension.create({
  name: "leaveSubmitToHost",
  priority: 1000,
  addKeyboardShortcuts: () => ({ "Mod-Enter": () => true }),
});

/// The block editor of a page that does not exist yet (the body of a quick create
/// dialog): every block of a page, the "/" menu and "@" mentions included, held in
/// memory. `onChange` gets the blocks after every edit; the host writes them with
/// `saveDraftBlocks` once the page is created. A File added here is stored in the Space
/// but attached to nothing, as on a flashcard. Remount it (with a new `key`) to clear it.
export function DraftBlockEditor({
  spaceId,
  onChange,
  placeholder = "Add description…",
  label,
  className,
}: {
  spaceId: string;
  onChange: (blocks: BlockInput[]) => void;
  placeholder?: string;
  /// The accessible name of the text box.
  label: string;
  className?: string;
}) {
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pasteFiles = usePasteFiles(spaceId, "");

  useEffect(applyPageTypography, []);

  const editor = useEditor({
    content: { type: "doc", content: [{ type: "paragraph" }] },
    extensions: [
      ...editorExtensions({
        spaceId,
        pageId: "",
        getEntities: () => entitiesRef.current,
        placeholder,
      }),
      LeaveSubmitToHost,
    ],
    editorProps: {
      attributes: {
        class: cn("tiptap-content page-editor draft-body", className),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
      handlePaste: (view, event) => pasteFiles.handlePaste(view, event),
      handleDrop: (view, event) => pasteFiles.handleDrop(view, event),
      handleClickOn: (_view, _pos, _node, _nodePos, event) => openLink(event, spaceId),
    },
    onUpdate: ({ editor: e }) => {
      // SAFETY: `getJSON()`'s recursive node shape satisfies the subset `JSONNode` reads.
      onChangeRef.current(draftBlocks((e.getJSON().content ?? []) as JSONNode[]));
    },
  });

  useEffect(() => (editor ? trackActiveEditor(editor) : undefined), [editor]);

  return (
    <div className="relative">
      <TableControls editor={editor} />
      <HighlightColorBar editor={editor} />
      <TextColorBar editor={editor} />
      <EditorContent editor={editor} />
      {pasteFiles.popover}
    </div>
  );
}
