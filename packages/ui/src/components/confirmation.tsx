import * as React from "react";
import { Button } from "@nookly/ui/components/button";
import { Card, CardContent, CardHeader } from "@nookly/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@nookly/ui/components/collapsible";
import { cn } from "@nookly/ui/lib/utils";
import { ChevronDown } from "lucide-react";

/// A pending write's preview card (chat visual design §8.4): a Space-accent
/// card, a one-line summary, expandable detail, and Confirm/Cancel. Once
/// resolved it collapses into a one-line receipt — driven directly by
/// `resolved: boolean | null`, the same shape `PendingToolCall.resolved`
/// already has, rather than a generic tool-approval state machine.
export function Confirmation({
  spaceColor,
  summary,
  details,
  destructive,
  resolved,
  onConfirm,
  onCancel,
  className,
}: {
  spaceColor?: string;
  summary: React.ReactNode;
  details?: React.ReactNode;
  destructive?: boolean;
  resolved: boolean | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  // SAFETY: `--space-color` only ever receives a plain hex string or a CSS
  // `var(...)` fallback — `CSSProperties` just doesn't model custom properties.
  const style = { "--space-color": spaceColor ?? "var(--muted-foreground)" } as React.CSSProperties;

  if (resolved !== null) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border-l-2 border-(--space-color) bg-(--space-color)/5 px-3 py-1.5 text-sm text-muted-foreground",
          className,
        )}
        style={style}
      >
        <span>{summary}</span>
        <span className="text-xs">{resolved ? "· done" : "· cancelled"}</span>
      </div>
    );
  }

  return (
    <Card className={cn("gap-0 border-l-2 bg-(--space-color)/5 py-0", destructive ? "border-destructive" : "border-(--space-color)", className)} style={style}>
      <Collapsible>
        <CardHeader className="gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{summary}</p>
            {details && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="iconSm" aria-label="Show details">
                  <ChevronDown />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </CardHeader>
        {details && (
          <CollapsibleContent>
            <CardContent className="pb-3 text-sm text-muted-foreground">{details}</CardContent>
          </CollapsibleContent>
        )}
        <CardContent className="flex justify-end gap-2 pb-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "secondary"} size="sm" onClick={onConfirm}>
            Confirm
          </Button>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
