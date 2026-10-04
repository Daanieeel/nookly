import { cva, type VariantProps } from "class-variance-authority";
import type { CSSProperties } from "react";
import { CardContent } from "@nookly/ui/components/card";
import { InteractiveCard } from "@nookly/ui/components/interactive-card";
import { cn } from "@nookly/ui/lib/utils";

/// A gallery tile built on the `Card` primitive itself (never modified) —
/// same surface identity as every other `Card` in the app (e.g. the sidebar
/// mascot card: `rounded-xl`/`border-input`/`bg-accent`), just adapted
/// structurally for a banner + grid tile: no default `gap-6` between banner
/// and body, and `overflow-hidden` so the banner's fill respects the card's
/// own rounded corners. Nothing here touches Card's own color/shape.
const galleryCardVariants = cva(
  "gap-0 overflow-hidden transition-colors hover:border-foreground/20",
  {
    variants: {
      variant: {
        default: "",
        /// The "add new" tile in an otherwise-empty gallery — marks itself as
        /// an action, not content.
        dashed: "border-dashed",
      },
      ghost: {
        /// A decorative, non-interactive placeholder card (§ empty-state
        /// gallery) — faded and inert rather than a real tile.
        true: "pointer-events-none opacity-40",
        false: "",
      },
    },
    defaultVariants: { variant: "default", ghost: false },
  },
);

function GalleryCard({
  className,
  variant,
  ghost,
  ...props
}: React.ComponentProps<typeof InteractiveCard> & VariantProps<typeof galleryCardVariants>) {
  // Clickable behavior (button role, focus, Enter/Space) comes from `InteractiveCard`.
  return (
    <InteractiveCard
      data-slot="gallery-card"
      className={cn(galleryCardVariants({ variant, ghost }), className)}
      {...props}
    />
  );
}

function GalleryCardBanner({
  color,
  icon,
  className,
}: {
  /// Any valid CSS `background` value — a plain color or a gradient (e.g.
  /// `gradientForName`). Uses the `background` shorthand
  /// rather than `background-color` specifically so gradients paint; the
  /// primitive itself has no opinion on where the value comes from.
  color: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="gallery-card-banner"
      className={cn(
        "flex h-14 shrink-0 items-end justify-end [background:var(--banner-color)] p-2 text-white/40",
        className,
      )}
      // SAFETY: `--banner-color` only ever receives `color`, a plain CSS
      // `background` value — `CSSProperties` just doesn't model custom
      // properties.
      style={{ "--banner-color": color } as CSSProperties}
    >
      {icon}
    </div>
  );
}

function GalleryCardBody({ className, ...props }: React.ComponentProps<typeof CardContent>) {
  return (
    <CardContent
      data-slot="gallery-card-body"
      className={cn("flex flex-col gap-2 p-3", className)}
      {...props}
    />
  );
}

/// A photo banner instead of `GalleryCardBanner`'s flat/gradient fill — a
/// Recipe's cover photo, say. Fades to the card's own background at the
/// bottom so the body reads as one continuous surface rather than a hard
/// seam under the image, and keeps `GalleryCardBanner` itself untouched
/// (frozen primitives, §01) for callers that still want a plain color fill.
function GalleryCardImageBanner({
  src,
  icon,
  fade = true,
  className,
}: {
  /// Image URL (or `null`/`undefined` to show only the icon on a muted fill,
  /// e.g. before a banner has been set).
  src?: string | null;
  icon?: React.ReactNode;
  /// Bottom fade into the card background. On by default; turn off for a
  /// hard edge.
  fade?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="gallery-card-image-banner"
      className={cn(
        "relative flex h-24 shrink-0 items-end justify-end overflow-hidden p-2",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      {fade && (
        <div className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-card to-transparent" />
      )}
      <div className="relative text-white/70">{icon}</div>
    </div>
  );
}

export { GalleryCard, GalleryCardBanner, GalleryCardImageBanner, GalleryCardBody };
