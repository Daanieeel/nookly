import type { CardBlock, IndexCard } from "@nookly/shared/data";
import { textFaceBlocks } from "@nookly/shared/data";
import { useMemo } from "react";
import { View } from "react-native";
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
  return <BlocksFace card={card} side={side} blocks={blocks} />;
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
