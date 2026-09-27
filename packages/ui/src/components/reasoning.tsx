import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@nookly/ui/components/collapsible";
import { Shimmer } from "@nookly/ui/components/shimmer";
import { cn } from "@nookly/ui/lib/utils";
import { Brain, ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";

/// A provider's reasoning/thinking trace: auto-opens while streaming,
/// auto-collapses shortly after it finishes, always re-openable by hand.
interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = useContext(ReasoningContext);
  if (!context) throw new Error("Reasoning components must be used within Reasoning");
  return context;
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY_MS = 1000;

export const Reasoning = memo(
  ({ className, isStreaming = false, open, defaultOpen, onOpenChange, duration: durationProp, children, ...props }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({ defaultProp: resolvedDefaultOpen, onChange: onOpenChange, prop: open });
    const [duration, setDuration] = useControllableState<number | undefined>({ defaultProp: undefined, prop: durationProp });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        startTimeRef.current ??= Date.now();
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / 1000));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) setIsOpen(true);
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    useEffect(() => {
      if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY_MS);
        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback((next: boolean) => setIsOpen(next), [setIsOpen]);
    const contextValue = useMemo(() => ({ duration, isOpen, isStreaming, setIsOpen }), [duration, isOpen, isStreaming, setIsOpen]);

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible className={cn("mb-2", className)} onOpenChange={handleOpenChange} open={isOpen} {...props}>
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);
Reasoning.displayName = "Reasoning";

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

function defaultGetThinkingMessage(isStreaming: boolean, duration?: number) {
  if (isStreaming || duration === 0)
    return (
      <Shimmer as="span" duration={1}>
        Thinking...
      </Shimmer>
    );
  if (duration === undefined) return <span>Thought for a few seconds</span>;
  return <span>Thought for {duration}s</span>;
}

export const ReasoningTrigger = memo(({ className, children, getThinkingMessage = defaultGetThinkingMessage, ...props }: ReasoningTriggerProps) => {
  const { isStreaming, isOpen, duration } = useReasoning();
  return (
    <CollapsibleTrigger className={cn("flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground", className)} {...props}>
      {children ?? (
        <>
          <Brain className="size-4" />
          {getThinkingMessage(isStreaming, duration)}
          <ChevronDown className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
        </>
      )}
    </CollapsibleTrigger>
  );
});
ReasoningTrigger.displayName = "ReasoningTrigger";

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & { children: string };

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-3 text-sm text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
      className,
    )}
    {...props}
  >
    <Streamdown>{children}</Streamdown>
  </CollapsibleContent>
));
ReasoningContent.displayName = "ReasoningContent";
