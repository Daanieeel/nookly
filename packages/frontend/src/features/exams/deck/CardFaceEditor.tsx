import { useQuery } from "@tanstack/react-query";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { editorExtensions } from "#/features/notes/editor-extensions.ts";
import type { JSONNode } from "#/features/notes/block-markdown.ts";
import { openLink } from "#/features/notes/open-link.ts";
import { usePasteFiles } from "#/features/notes/paste-files.tsx";
import { applyPageTypography } from "#/features/notes/page-typography.ts";
import { listEntities } from "#/lib/api/entities.ts";
import type { CardBlock } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { cn } from "@nookly/ui/lib/utils";
import { blocksToNodes, nodesToBlocks, type Side } from "./card-blocks";

/// What the writer does with the keys a card face owns.
export interface FaceKeys {
  /// Tab: turn the card over.
  flip: () => void;
  /// Cmd or Ctrl and Enter: drop the card onto the deck.
  submit: () => void;
  /// Escape: leave the writer.
  leave: () => void;
}

/// Keys of the editor as a plugin, so the handler sees the event and can keep it from
/// reaching the page's own shortcuts. Listed by priority: a key a block already uses
/// (Tab in a list or a table, Escape in the "/" menu) is theirs first.
function faceKeys(
  name: string,
  priority: number,
  keys: Record<string, (event: KeyboardEvent) => void>,
) {
  return Extension.create({
    name,
    priority,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleKeyDown: (_view, event) => {
              if (event.isComposing) return false;
              const mod = event.metaKey || event.ctrlKey;
              const handler =
                keys[mod && event.key === "Enter" ? "Mod-Enter" : event.shiftKey ? "" : event.key];
              if (!handler) return false;
              event.preventDefault();
              event.stopPropagation();
              handler(event);
              return true;
            },
          },
        }),
      ];
    },
  });
}

/// One side of a card, written in the same block editor as a note: text, formulas,
/// pictures and every other block. Enter starts a new line; the writer's keys are in `keys`.
export function CardFaceEditor({
  spaceId,
  side,
  initial,
  active,
  keys,
  onChange,
}: {
  spaceId: string;
  side: Side;
  initial: CardBlock[];
  /// The side facing up, which takes the caret.
  active: boolean;
  keys: FaceKeys;
  onChange: (blocks: CardBlock[]) => void;
}) {
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // A card is not a page, so a File added to it is attached to nothing.
  const pasteFiles = usePasteFiles(spaceId, "");

  useEffect(applyPageTypography, []);

  const editor = useEditor({
    content: { type: "doc", content: blocksToNodes(initial) },
    extensions: [
      ...editorExtensions({
        spaceId,
        pageId: "",
        getEntities: () => entitiesRef.current,
        placeholder: side === "front" ? "Question, term or prompt" : "Answer",
      }),
      faceKeys("cardSubmitKeys", 1000, { "Mod-Enter": () => keysRef.current.submit() }),
      faceKeys("cardFlipKeys", 60, {
        Tab: () => keysRef.current.flip(),
        Escape: () => keysRef.current.leave(),
      }),
    ],
    editorProps: {
      attributes: {
        class: cn("tiptap-content page-editor card-face", `card-face-${side}`),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": side === "front" ? "Card front" : "Card back",
      },
      handlePaste: (view, event) => pasteFiles.handlePaste(view, event),
      handleDrop: (view, event) => pasteFiles.handleDrop(view, event),
      handleClickOn: (_view, _pos, _node, _nodePos, event) => openLink(event, spaceId),
    },
    onUpdate: ({ editor: e }) => {
      // SAFETY: `getJSON()`'s recursive node shape satisfies the subset `JSONNode` reads.
      onChangeRef.current(nodesToBlocks((e.getJSON().content ?? []) as JSONNode[]));
    },
  });

  useEffect(() => {
    if (active && editor && !editor.isDestroyed)
      editor.commands.focus("end", { scrollIntoView: false });
  }, [active, editor]);

  return (
    <>
      <EditorContent editor={editor} className="min-h-0 w-full" />
      {pasteFiles.popover}
    </>
  );
}
