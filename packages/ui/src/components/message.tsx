import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

/// A chat turn's outer wrapper: `from="user"` right-aligns and tints, any
/// other role renders full width, unbubbled (chat visual design §8.1).
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "system" | "tool";
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-role={from}
      className={cn("group flex w-full max-w-full flex-col gap-2", from === "user" ? "ml-auto items-end" : "", className)}
      {...props}
    />
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export function MessageContent({ children, className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex w-fit min-w-0 max-w-[720px] flex-col gap-2 overflow-hidden text-sm text-foreground",
        "group-data-[role=user]:rounded-lg group-data-[role=user]:bg-accent group-data-[role=user]:px-4 group-data-[role=user]:py-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageActionsProps = ComponentProps<"div">;

export function MessageActions({ className, children, ...props }: MessageActionsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props}>
      {children}
    </div>
  );
}

export type MessageActionProps = ComponentProps<typeof Button> & { tooltip?: string; label?: string };

export function MessageAction({ tooltip, children, label, variant = "ghost", size = "iconSm", ...props }: MessageActionProps) {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/// Streaming-safe markdown rendering (headings, lists, tables, code blocks
/// with copy/highlight) — replaces flat `whitespace-pre-wrap` text.
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)} {...props} />
  ),
  (prev, next) => prev.children === next.children,
);
MessageResponse.displayName = "MessageResponse";
