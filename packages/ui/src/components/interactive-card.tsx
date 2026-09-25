import { cva } from "class-variance-authority";
import { Card } from "@nookly/ui/components/card";
import { cn } from "@nookly/ui/lib/utils";

/// `Card`'s own opt-in clickable treatment (hover/cursor/motion), same pattern
/// `GalleryCard` already uses for its own tiles — kept here as a small,
/// additive primitive rather than restyled inline at each call site (that's
/// what `shadcn/no-restyle` catches: `<Card>` owns its own color/motion).
const interactiveCardVariants = cva("", {
  variants: {
    clickable: {
      true: "cursor-pointer transition-colors hover:border-foreground/20",
      false: "",
    },
  },
  defaultVariants: { clickable: false },
});

function InteractiveCard({
  className,
  onClick,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof Card>) {
  const clickable = Boolean(onClick);
  return (
    <Card
      data-slot="interactive-card"
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
      className={cn(interactiveCardVariants({ clickable }), className)}
      {...props}
    />
  );
}

export { InteractiveCard };
