import { Button } from "@nookly/ui/components/button";
import { Textarea } from "@nookly/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { CornerDownLeft, Loader2, Square, X } from "lucide-react";
import type { ComponentProps, FormHTMLAttributes, HTMLAttributes, KeyboardEventHandler, MouseEvent } from "react";
import { useCallback, useState } from "react";

/// The chat composer (chat visual design §8.6): an auto-growing textarea
/// (Enter sends, Shift+Enter newlines, IME composition safe so it doesn't
/// submit mid-composition for CJK input), a toolbar row, and a submit button
/// whose icon reflects the turn's status.
export type PromptInputProps = FormHTMLAttributes<HTMLFormElement>;

export function PromptInput({ className, ...props }: PromptInputProps) {
  return <form className={cn("flex flex-col gap-2 rounded-lg border border-input bg-accent p-2", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<typeof Textarea>;

export function PromptInputTextarea({ onKeyDown, className, placeholder = "Ask the assistant...", ...props }: PromptInputTextareaProps) {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Enter" && !(isComposing || e.nativeEvent.isComposing) && !e.shiftKey) {
        e.preventDefault();
        const { form } = e.currentTarget;
        // SAFETY: the selector only ever matches a <button type="submit">,
        // whose DOM interface is always HTMLButtonElement.
        const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        if (submitButton?.disabled) return;
        form?.requestSubmit();
      }
    },
    [onKeyDown, isComposing],
  );

  return (
    <Textarea
      className={cn("field-sizing-content max-h-48 min-h-10 border-none bg-transparent shadow-none focus-visible:ring-0", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
}

export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputToolbar({ className, ...props }: PromptInputToolbarProps) {
  return <div className={cn("flex items-center justify-between gap-2", className)} {...props} />;
}

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;
}

export type PromptInputButtonProps = ComponentProps<typeof Button> & { tooltip?: string };

export function PromptInputButton({ variant = "ghost", size, tooltip, children, ...props }: PromptInputButtonProps) {
  const resolvedSize = size ?? "iconSm";
  const button = (
    <Button size={resolvedSize} type="button" variant={variant} {...props}>
      {children}
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

export type PromptInputStatus = "idle" | "submitted" | "streaming" | "error";

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: PromptInputStatus;
  onStop?: () => void;
};

export function PromptInputSubmit({ className, variant = "default", size = "iconSm", status = "idle", onStop, onClick, children, ...props }: PromptInputSubmitProps) {
  const isGenerating = status === "submitted" || status === "streaming";

  let icon = <CornerDownLeft className="size-4" />;
  if (status === "submitted") icon = <Loader2 className="size-4 animate-spin" />;
  else if (status === "streaming") icon = <Square className="size-4" />;
  else if (status === "error") icon = <X className="size-4" />;

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (isGenerating && onStop) {
        e.preventDefault();
        onStop();
        return;
      }
      onClick?.(e);
    },
    [isGenerating, onStop, onClick],
  );

  return (
    <Button
      aria-label={isGenerating ? "Stop" : "Send"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? icon}
    </Button>
  );
}
