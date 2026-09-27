import { cn } from "@nookly/ui/lib/utils";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { memo, useMemo } from "react";

/// A looping text shimmer, for a quiet "the assistant is thinking/working"
/// state — cheaper and calmer than a spinner for text that's about to be
/// replaced by real content.
const MotionP = motion.create("p");
const MotionSpan = motion.create("span");

export interface ShimmerProps {
  children: string;
  as?: "p" | "span";
  className?: string;
  duration?: number;
  spread?: number;
}

function ShimmerImpl({ children, as = "p", className, duration = 2, spread = 2 }: ShimmerProps) {
  const MotionComponent = as === "span" ? MotionSpan : MotionP;
  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-size-[250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]",
        "[background-image:var(--bg),linear-gradient(var(--color-muted-foreground),var(--color-muted-foreground))] [background-repeat:no-repeat,padding-box]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      // SAFETY: `--spread` is the only custom property set here — a plain
      // pixel length computed from `children`'s own text length, which
      // `CSSProperties` just doesn't model.
      style={{ "--spread": `${dynamicSpread}px` } as CSSProperties}
      transition={{ duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
    >
      {children}
    </MotionComponent>
  );
}

export const Shimmer = memo(ShimmerImpl);
