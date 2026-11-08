import { IconMaximize, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { MAX_ZOOM, MIN_ZOOM } from "./graph-zoom.ts";

/// Zoom out, zoom in and fit to view, floating over the corner of the graph.
export function GraphZoomControls({
  zoom,
  onZoomOut,
  onZoomIn,
  onFit,
}: {
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur"
    >
      <ZoomButton label="Zoom Out" disabled={zoom <= MIN_ZOOM} onClick={onZoomOut}>
        <IconZoomOut />
      </ZoomButton>
      <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <ZoomButton label="Zoom In" disabled={zoom >= MAX_ZOOM} onClick={onZoomIn}>
        <IconZoomIn />
      </ZoomButton>
      <ZoomButton label="Fit To View" onClick={onFit}>
        <IconMaximize />
      </ZoomButton>
    </div>
  );
}

function ZoomButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
