import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// An inline entity reference: icon, truncated title, and the owning Space's
/// accent color — the Assistant's sources row and message body use this for
/// every entity it mentions (chat visual design §8.3). Neither existing pill
/// (`EntityMention` in the frontend package, code-box styled but not
/// clickable; `EntityPill` in `dashboard-links.tsx`, clickable but with no
/// icon or Space color) covers this shape on its own.
function EntityPill({
  icon,
  title,
  spaceColor,
  onClick,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  /// A Space's accent hex color. Renders as a subtle tint, the same
  /// `--space-color` custom property pattern `SpaceGlyph` uses elsewhere.
  spaceColor?: string;
  onClick?: () => void;
  className?: string;
}) {
  const classes = cn(
    "inline-flex max-w-[220px] items-center gap-1 rounded-md border border-(--space-color)/30 bg-(--space-color)/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-foreground",
    onClick &&
      "cursor-pointer transition-colors hover:bg-(--space-color)/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    className,
  );
  // SAFETY: `--space-color` only ever receives a plain hex string or a CSS
  // `var(...)` fallback — `CSSProperties` just doesn't model custom properties.
  const style = { "--space-color": spaceColor ?? "var(--muted-foreground)" } as React.CSSProperties;
  const content = (
    <>
      {icon}
      <span className="truncate">{title}</span>
    </>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onClick ? (
          <button type="button" onClick={onClick} className={classes} style={style}>
            {content}
          </button>
        ) : (
          <span className={classes} style={style}>
            {content}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export { EntityPill };
