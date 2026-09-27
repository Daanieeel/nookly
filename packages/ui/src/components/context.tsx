import { Badge } from "@nookly/ui/components/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";
import { Gauge } from "lucide-react";
import type { ComponentProps } from "react";

/// The active provider's context budget (PLAN §3.1 — a large cloud model gets
/// more of a note or more search results per request than a small on-device
/// one). Shows the real window size this provider reports; no live per-call
/// usage breakdown, since providers don't all report token usage back today.
export type ContextProps = ComponentProps<typeof Popover>;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export function Context(props: ContextProps) {
  return <Popover {...props} />;
}

export type ContextTriggerProps = ComponentProps<typeof Badge> & { contextTokens: number };

export function ContextTrigger({ className, contextTokens, ...props }: ContextTriggerProps) {
  return (
    <PopoverTrigger asChild>
      <Badge variant="secondary" className={cn("cursor-pointer gap-1", className)} {...props}>
        <Gauge className="size-3" />
        {formatTokens(contextTokens)} context
      </Badge>
    </PopoverTrigger>
  );
}

export type ContextContentProps = ComponentProps<typeof PopoverContent> & { contextTokens: number };

export function ContextContent({ className, contextTokens, ...props }: ContextContentProps) {
  return (
    <PopoverContent className={cn("w-64 text-sm", className)} {...props}>
      <p className="font-medium text-foreground">{formatTokens(contextTokens)} token window</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This provider's context budget for one request — how much of a note, or how many search results, it can be handed at once.
      </p>
    </PopoverContent>
  );
}
