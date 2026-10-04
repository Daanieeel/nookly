import type { ReactNode } from "react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";

/// A small icon button in a media or web block's hover toolbar.
export function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label={label}
          onClick={onClick}
          className="size-7"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
