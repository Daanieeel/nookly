import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IconSearch } from "@tabler/icons-react";
import { Command } from "cmdk";
import type { ComponentProps, ReactNode, Ref } from "react";
import { DialogPortal } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import type { TextSegment } from "@/lib/search-results";
import { cn } from "@/lib/utils";

/// Shared shell for the Cmd+K palette and the Cmd+P quick switcher: a floating,
/// Spotlight style overlay over a softly blurred backdrop. Deliberately roomier
/// than the dense working surfaces, since it's a focused, momentary overlay.
export function SpotlightDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Screen reader name for the dialog.
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-[14vh] left-1/2 z-50 flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden",
            "rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-2xl outline-none",
            "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <Command
            shouldFilter={false}
            loop
            label={title}
            className={cn(
              "flex min-h-0 flex-col",
              "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1",
              "**:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:text-muted-foreground",
            )}
          >
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

export function SpotlightInput({
  ref,
  ...props
}: ComponentProps<typeof Command.Input> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/70 px-5">
      <IconSearch size={20} className="shrink-0 text-muted-foreground" />
      <Command.Input
        ref={ref}
        className="h-16 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
        {...props}
      />
      <Kbd>esc</Kbd>
    </div>
  );
}

export function SpotlightList({ children }: { children: ReactNode }) {
  return (
    <Command.List className="max-h-[min(30rem,56vh)] scroll-py-2 overflow-y-auto overscroll-contain p-2">
      {children}
    </Command.List>
  );
}

export function SpotlightEmpty({ children }: { children: ReactNode }) {
  return (
    <Command.Empty className="px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </Command.Empty>
  );
}

export function SpotlightItem({ className, ...props }: ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm outline-none",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

/// Renders text with its matched parts emphasized.
export function Highlighted({ segments }: { segments: TextSegment[] }) {
  return segments.map((segment, i) =>
    segment.match ? (
      <mark key={i} className="rounded-xs bg-primary/15 text-foreground">
        {segment.text}
      </mark>
    ) : (
      <span key={i}>{segment.text}</span>
    ),
  );
}

/// Keyboard hints along the bottom edge, plus an optional hint on the right
/// (e.g. the sibling overlay's shortcut).
export function SpotlightFooter({ aside }: { aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <KbdGroup>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
        </KbdGroup>
        Navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>↵</Kbd>
        Open
      </span>
      {aside && <span className="ml-auto flex items-center gap-1.5">{aside}</span>}
    </div>
  );
}
