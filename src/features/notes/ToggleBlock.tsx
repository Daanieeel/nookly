import { IconChevronRight } from "@tabler/icons-react";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/// A summary line that folds the paragraphs under it away. The chevron and the
/// `toggle` attr (`open` / `closed`) are the only state; the paragraphs stay in
/// the document either way, hidden by CSS.
export function ToggleBlock({ node, updateAttributes }: ReactNodeViewProps) {
  const open = node.attrs.toggle === "open";
  const label = open ? "Collapse" : "Expand";
  return (
    <NodeViewWrapper className="toggle-block" data-toggle={open ? "open" : "closed"}>
      <div contentEditable={false} className="flex h-[1.625em] shrink-0 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={label}
              aria-expanded={open}
              onClick={() => updateAttributes({ toggle: open ? "closed" : "open" })}
              className="size-5"
            >
              <IconChevronRight
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform duration-150",
                  open && "rotate-90",
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </div>
      <NodeViewContent<"div"> as="div" className="toggle-content min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}
