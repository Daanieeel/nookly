import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { CardState } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/// A physical index card: 5 by 3, turning over in 3D. The hidden side is inert,
/// so Tab and screen readers only ever reach the side facing up.
export function FlipCard({
  flipped,
  front,
  back,
  className,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={cn("aspect-5/3 w-full perspective-[1600px]", className)}>
      <motion.div
        className="relative size-full transform-3d"
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 24 }
        }
      >
        <div className="absolute inset-0 backface-hidden" inert={flipped || undefined}>
          {front}
        </div>
        <div
          className="absolute inset-0 rotate-y-180 backface-hidden"
          inert={!flipped || undefined}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}

/// The paper of one side. The front is blank stock, the back is ruled for writing.
export function CardSurface({
  side,
  label,
  corner,
  invalid = false,
  className,
  children,
}: {
  side: "front" | "back";
  label?: ReactNode;
  corner?: ReactNode;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "index-card-paper relative flex size-full flex-col overflow-hidden rounded-lg border bg-card",
        side === "back" && "index-card-ruled",
        invalid ? "border-destructive" : "border-border",
        className,
      )}
    >
      {(label || corner) && (
        <div className="flex h-7 shrink-0 items-center justify-between px-4 pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>{label}</span>
          <span className="normal-case tracking-normal">{corner}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/// The deck as a physical pile: up to four card edges under a count, bumping when it grows.
export function DeckStack({
  count,
  size = "md",
  className,
}: {
  count: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const layers = Math.max(1, Math.min(count, 4));
  const width = size === "sm" ? "w-14" : "w-24";
  return (
    <div className={cn("relative aspect-5/3 shrink-0", width, className)} aria-hidden>
      {Array.from({ length: layers }, (_, i) => {
        const depth = layers - 1 - i;
        return (
          <div
            key={i}
            className={cn(
              "deck-stack-layer absolute inset-0 rounded-md border border-border bg-card",
              count === 0 && "border-dashed bg-transparent",
            )}
            // SAFETY: both properties only ever receive numbers worked out above.
            style={
              {
                "--depth": depth,
                "--tilt": `${depth === 0 ? 0 : depth % 2 ? -2 : 1.5}deg`,
              } as CSSProperties
            }
          />
        );
      })}
      <motion.span
        key={count}
        initial={reduceMotion ? false : { scale: 1.25 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className={cn(
          "absolute inset-0 flex items-center justify-center font-heading font-semibold tabular-nums",
          size === "sm" ? "text-sm" : "text-xl",
          count === 0 && "text-muted-foreground",
        )}
      >
        {count}
      </motion.span>
    </div>
  );
}

/// The Anki colors for where a card is in learning: new blue, learning red, review green.
export const STATE_TONE = {
  new: "text-accent-blue",
  learning: "text-accent-pink",
  review: "text-positive",
} as const;

export function stateGroup(state: CardState): "new" | "learning" | "review" {
  if (state === "learning" || state === "relearning") return "learning";
  return state;
}
