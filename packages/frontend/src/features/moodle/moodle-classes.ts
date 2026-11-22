import { CARD_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

/// The Moodle pages' cards are the app's own: raised, a hairline edge, the layered shadow.
/// `extra` sets the padding and layout of the one in hand (a card's default gap is for stacked
/// sections, so it starts at none).
export const card = (...extra: Parameters<typeof cn>) => cn(CARD_CLASSES, "gap-0", ...extra);

/// A card that is one button: it answers a hover with its edge, as every clickable card does.
export const cardButton = (...extra: Parameters<typeof cn>) =>
  card(
    "w-full cursor-pointer text-left transition-colors hover:border-foreground/20 focus-ring",
    ...extra,
  );
