import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconBulb,
  IconCheck,
  IconInfoCircle,
} from "@tabler/icons-react";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { asString, type JSONAttrValue } from "./block-markdown";

export const CALLOUT_VARIANTS = [
  { value: "note", label: "Note", icon: IconInfoCircle },
  { value: "tip", label: "Tip", icon: IconBulb },
  { value: "warning", label: "Warning", icon: IconAlertTriangle },
  { value: "danger", label: "Danger", icon: IconAlertOctagon },
] as const;

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]["value"];

export function calloutVariant(value: JSONAttrValue | undefined): CalloutVariant {
  return CALLOUT_VARIANTS.find((v) => v.value === asString(value))?.value ?? "note";
}

/// An aside the reader shouldn't skip. The text is regular inline content, so
/// marks and mentions work as in a paragraph; the icon picks the tone.
export function CalloutBlock({ node, updateAttributes, editor }: ReactNodeViewProps) {
  // SAFETY: the callout node only ever writes `variant` as a string.
  const variant = calloutVariant(node.attrs.variant as JSONAttrValue | undefined);
  const current = CALLOUT_VARIANTS.find((v) => v.value === variant) ?? CALLOUT_VARIANTS[0];
  const Icon = current.icon;

  return (
    <NodeViewWrapper className="callout my-1" data-variant={variant}>
      <div contentEditable={false} className="flex h-6 shrink-0 items-center">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild disabled={!editor.isEditable}>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Change Callout Type"
                  className="size-6"
                >
                  <Icon className="callout-icon size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Change Callout Type</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-40">
            {CALLOUT_VARIANTS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => updateAttributes({ variant: option.value })}
                className="gap-2"
              >
                <option.icon className="size-4 text-muted-foreground" />
                <span className="flex-1">{option.label}</span>
                {option.value === variant && <IconCheck className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <NodeViewContent<"div"> as="div" className="min-w-0 flex-1 py-0.5" />
    </NodeViewWrapper>
  );
}
