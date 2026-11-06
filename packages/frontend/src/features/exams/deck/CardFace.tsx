import type { IndexCard } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { Side } from "./card-blocks";
import { CardFaceView } from "./CardFaceView";
import { CardText, faceTextSize } from "./card-text";

/// One side of a card while studying. A card written with blocks is drawn by the block
/// editor, read only; one from before that, from its text.
export function CardFace({
  card,
  side,
  spaceId,
  muted = false,
}: {
  card: IndexCard;
  side: Side;
  spaceId: string;
  /// The front shown small above the answer.
  muted?: boolean;
}) {
  const blocks = side === "front" ? card.frontBlocks : card.backBlocks;
  if (blocks) {
    return (
      <CardFaceView
        spaceId={spaceId}
        side={side}
        blocks={blocks}
        className={cn(muted && "text-muted-foreground")}
      />
    );
  }
  const text = card[side];
  if (muted) return <CardText text={text} className="text-sm/7 text-muted-foreground" />;
  return (
    <CardText
      text={text}
      className={side === "front" ? cn("font-medium", faceTextSize(text)) : "text-base/7"}
    />
  );
}
