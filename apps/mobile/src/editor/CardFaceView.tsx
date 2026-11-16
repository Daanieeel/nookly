import type { CardBlock, IndexCard } from "@nookly/shared/data";
import { textFaceBlocks } from "@nookly/shared/data";
import { useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useFile } from "../data/queries.ts";
import { pathOf } from "../screens/file-kinds.ts";
import { ImageLightbox } from "../ui/ImageLightbox.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { Text } from "../ui/Text.tsx";
import { faceDoc } from "./card-face.ts";
import { PageDocEditor } from "./LivePage.tsx";

/// A face written as text, as the blocks the editor holds.
export function textBlocks(text: string): CardBlock[] {
  return text.trim() === ""
    ? []
    : textFaceBlocks(text).map((b) => ({
        type: b.type,
        content: b.content,
        language: null,
        filename: null,
        attrs: b.attrs ?? {},
      }));
}

/// A card's face as blocks: the ones it was written with, or its text.
export function faceBlocks(card: IndexCard, side: "front" | "back"): CardBlock[] {
  return (side === "front" ? card.frontBlocks : card.backBlocks) ?? textBlocks(card[side]);
}

/// A face in the order it was written: its writing, and between it the pictures, each a
/// File it points at (`[name](mention:id)`), as the desktop's image block holds one.
export type FaceRun =
  | { kind: "blocks"; blocks: CardBlock[] }
  | { kind: "picture"; fileId: string; name: string };

const PICTURE = /^\[([^\]]*)\]\(mention:([^)#]+)/;

export function faceRuns(blocks: CardBlock[]): FaceRun[] {
  const runs: FaceRun[] = [];
  for (const b of blocks) {
    const picture = b.type === "image" ? PICTURE.exec(b.content.trim()) : null;
    const last = runs.at(-1);
    if (picture) runs.push({ kind: "picture", fileId: picture[2], name: picture[1] });
    else if (last?.kind === "blocks") last.blocks.push(b);
    else runs.push({ kind: "blocks", blocks: [b] });
  }
  return runs;
}

/// Whether a face is words only, which plain text draws as written.
const wordsOnly = (blocks: CardBlock[]) =>
  blocks.every((b) => b.type === "paragraph" && !/[*_`$[\]]/.test(b.content));

/// A card's face to read, as the desktop's `CardFace`: words as text, and a face with more
/// than words (a picture, a formula, code, a list) in the page editor, read only, so it
/// shows as it was written.
export function CardFaceView({
  card,
  side,
  heading = false,
  muted = false,
}: {
  card: IndexCard;
  side: "front" | "back";
  heading?: boolean;
  muted?: boolean;
}) {
  const tablet = useIsTablet();
  const blocks = faceBlocks(card, side);
  const text = side === "front" ? card.front : card.back;
  if (wordsOnly(blocks)) {
    return (
      <Text
        variant={heading ? "heading" : "body"}
        tone={muted ? "muted" : "default"}
        accessibilityLabel={`${side === "front" ? "Front" : "Back"}: ${text}`}
      >
        {blocks.map((b) => b.content).join("\n")}
      </Text>
    );
  }
  const runs = faceRuns(blocks);
  if (tablet && runs.some((r) => r.kind === "picture")) {
    return <PicturesFace card={card} side={side} runs={runs} />;
  }
  return <BlocksFace card={card} side={side} blocks={blocks} />;
}

/// A picture on a tablet's card face, drawn from its File on this device; a tap opens it
/// as large as the window allows (10.4). One not here yet says so.
function FacePicture({ fileId, name }: { fileId: string; name: string }) {
  const { data: file } = useFile(fileId);
  const [open, setOpen] = useState(false);
  const uri = file ? pathOf(file) : null;
  if (!uri) {
    return (
      <Text variant="small" tone="muted">
        {file === null ? "This file no longer exists." : `${name}, not on this device yet`}
      </Text>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={name}
        accessibilityHint="Opens the picture larger"
        onPress={() => setOpen(true)}
        className="active:opacity-70"
      >
        <Image
          source={{ uri }}
          resizeMode="contain"
          className="rounded-md"
          style={{ width: "100%", height: 220 }}
        />
      </Pressable>
      <ImageLightbox image={open ? { uri, alt: name } : null} onClose={() => setOpen(false)} />
    </>
  );
}

/// A face with pictures on a tablet: its writing in the editor, read only, and each picture
/// drawn where it was written, to open larger.
function PicturesFace({
  card,
  side,
  runs,
}: {
  card: IndexCard;
  side: "front" | "back";
  runs: FaceRun[];
}) {
  return (
    <View className="gap-2">
      {runs.map((run, i) =>
        run.kind === "picture" ? (
          <FacePicture key={`${i}-${run.fileId}`} fileId={run.fileId} name={run.name} />
        ) : (
          <BlocksFace key={i} card={card} side={side} blocks={run.blocks} />
        ),
      )}
    </View>
  );
}

function BlocksFace({
  card,
  side,
  blocks,
}: {
  card: IndexCard;
  side: "front" | "back";
  blocks: CardBlock[];
}) {
  // SAFETY: a face shown to read; a new card or side mounts a new one (keyed by the caller).
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => faceDoc(blocks), [card.id, side]);
  return (
    <View
      testID="card-face-blocks"
      accessibilityLabel={`${side === "front" ? "Front" : "Back"}: ${side === "front" ? card.front : card.back}`}
    >
      <PageDocEditor
        doc={doc}
        awareness={null}
        entityId={card.deckId}
        editable={false}
        fill={false}
      />
    </View>
  );
}
