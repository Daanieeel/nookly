import { Badge } from "@nookly/ui/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@nookly/ui/components/collapsible";
import { cn } from "@nookly/ui/lib/utils";
import { CheckCircle2, ChevronDown, Circle, Clock, Wrench, XCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/// One tool call rendered as a structured, collapsible card — name, a status
/// badge, and (expanded) its arguments and result — instead of a raw JSON dump.
export type ToolState = "running" | "awaiting-confirmation" | "applied" | "cancelled" | "error";

export type ToolProps = ComponentProps<typeof Collapsible>;

export function Tool({ className, ...props }: ToolProps) {
  return <Collapsible className={cn("group mb-2 w-full rounded-md border border-input", className)} {...props} />;
}

const statusLabels = {
  running: "Running",
  "awaiting-confirmation": "Awaiting confirmation",
  applied: "Applied",
  cancelled: "Cancelled",
  error: "Error",
} satisfies Record<ToolState, string>;

const statusIcons = {
  running: <Circle className="size-4 animate-pulse" />,
  "awaiting-confirmation": <Clock className="size-4 text-warning" />,
  applied: <CheckCircle2 className="size-4 text-positive" />,
  cancelled: <XCircle className="size-4 text-muted-foreground" />,
  error: <XCircle className="size-4 text-destructive" />,
} satisfies Record<ToolState, ReactNode>;

export function ToolStatusBadge({ state }: { state: ToolState }) {
  return (
    <Badge variant="secondary" className="gap-1.5 rounded-full text-xs">
      {statusIcons[state]}
      {statusLabels[state]}
    </Badge>
  );
}

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & { name: string; state: ToolState };

export function ToolHeader({ className, name, state, ...props }: ToolHeaderProps) {
  return (
    <CollapsibleTrigger className={cn("flex w-full items-center justify-between gap-4 p-3", className)} {...props}>
      <div className="flex items-center gap-2">
        <Wrench className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{name}</span>
        <ToolStatusBadge state={state} />
      </div>
      <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "space-y-3 border-t border-input p-3 text-sm outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
        className,
      )}
      {...props}
    />
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

export function ToolInput({ input }: { input: unknown }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parameters</h4>
      <JsonBlock value={input} />
    </div>
  );
}

export function ToolOutput({ output, errorText }: { output?: unknown; errorText?: string }) {
  if (output === undefined && !errorText) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{errorText ? "Error" : "Result"}</h4>
      {errorText ? <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{errorText}</p> : <JsonBlock value={output} />}
    </div>
  );
}
