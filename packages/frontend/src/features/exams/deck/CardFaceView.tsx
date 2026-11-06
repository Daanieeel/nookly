import { useQuery } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { editorExtensions } from "#/features/notes/editor-extensions.ts";
import { openLink } from "#/features/notes/open-link.ts";
import { applyPageTypography } from "#/features/notes/page-typography.ts";
import { listEntities } from "#/lib/api/entities.ts";
import type { CardBlock } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { cn } from "@nookly/ui/lib/utils";
import { blocksToNodes, forReading, type Side } from "./card-blocks";
import { ImageLightbox } from "./ImageLightbox";

/// One side of a card written with blocks, read only, as it looks in the writer. A click on
/// a picture opens it larger instead of turning the card.
export function CardFaceView({
  spaceId,
  side,
  blocks,
  className,
}: {
  spaceId: string;
  side: Side;
  blocks: CardBlock[];
  className?: string;
}) {
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const [enlarged, setEnlarged] = useState<{ src: string; alt: string } | null>(null);

  useEffect(applyPageTypography, []);

  const editor = useEditor({
    editable: false,
    content: { type: "doc", content: blocksToNodes(forReading(blocks)) },
    extensions: editorExtensions({
      spaceId,
      pageId: "",
      getEntities: () => entitiesRef.current,
    }),
    editorProps: {
      attributes: { class: cn("tiptap-content page-editor card-face", `card-face-${side}`) },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => openLink(event, spaceId),
    },
  });

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a click on a picture is a pointer shortcut; the picture is reachable by keyboard in the Files page
    <div
      className={cn("w-full", className)}
      onClick={(event) => {
        // The picture dialog is part of this tree but not of the card.
        const { target } = event;
        if (!(target instanceof Element) || !event.currentTarget.contains(target)) {
          return event.stopPropagation();
        }
        const image = target.closest("img");
        if (!image?.src) return;
        // The card stays as it is: this click is about the picture.
        event.stopPropagation();
        setEnlarged({ src: image.src, alt: image.alt });
      }}
    >
      <EditorContent editor={editor} />
      <ImageLightbox image={enlarged} onClose={() => setEnlarged(null)} />
    </div>
  );
}
