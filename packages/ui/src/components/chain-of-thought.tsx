import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@nookly/ui/components/collapsible";
import { cn } from "@nookly/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Brain, ChevronDown, Dot } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";

/// A quiet, collapsible trail of what the assistant did this turn — tool
/// calls and reasoning steps in order, never a verbose log (chat visual
/// design §8.3's "tool activity shows as one quiet, collapsible status line").
interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThought() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) throw new Error("ChainOfThought components must be used within ChainOfThought");
  return context;
}

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(({ className, open, defaultOpen = false, onOpenChange, children, ...props }: ChainOfThoughtProps) => {
  const [isOpen, setIsOpen] = useControllableState({ defaultProp: defaultOpen, onChange: onOpenChange, prop: open });
  const value = useMemo(() => ({ isOpen, setIsOpen }), [isOpen, setIsOpen]);
  return (
    <ChainOfThoughtContext.Provider value={value}>
      <Collapsible className={cn("w-full", className)} onOpenChange={setIsOpen} open={isOpen} {...props}>
        {children}
      </Collapsible>
    </ChainOfThoughtContext.Provider>
  );
});
ChainOfThought.displayName = "ChainOfThought";

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger>;

export const ChainOfThoughtHeader = memo(({ className, children, ...props }: ChainOfThoughtHeaderProps) => {
  const { isOpen } = useChainOfThought();
  return (
    <CollapsibleTrigger className={cn("flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground", className)} {...props}>
      <Brain className="size-4" />
      <span className="flex-1 text-left">{children ?? "Working"}</span>
      <ChevronDown className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
    </CollapsibleTrigger>
  );
});
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
};

const stepStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  pending: "text-muted-foreground/50",
};

export const ChainOfThoughtStep = memo(({ className, icon: Icon = Dot, label, description, status = "complete", children, ...props }: ChainOfThoughtStepProps) => (
  <div className={cn("flex animate-in gap-2 fade-in-0 slide-in-from-top-2 text-sm", stepStatusStyles[status], className)} {...props}>
    <Icon className="mt-0.5 size-4 shrink-0" />
    <div className="flex-1 space-y-1 overflow-hidden">
      <div>{label}</div>
      {description && <div className="text-xs text-muted-foreground">{description}</div>}
      {children}
    </div>
  </div>
));
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>;

export const ChainOfThoughtContent = memo(({ className, children, ...props }: ChainOfThoughtContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-2 space-y-2 border-l-2 border-muted pl-4 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
      className,
    )}
    {...props}
  >
    {children}
  </CollapsibleContent>
));
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
