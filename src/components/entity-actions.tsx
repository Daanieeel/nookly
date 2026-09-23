import { IconDots, IconFileDownload, IconPin, IconPinFilled, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CopyPageMarkdownItem,
  PageExportMenu,
  savePageMarkdownFile,
} from "@/features/notes/PageExportMenu";
import type { Entity } from "@/lib/api/types";
import { labelForType } from "@/lib/entity-title";
import { cn } from "@/lib/utils";

/// Export (pages only), Pin, and an overflow menu repeating both plus Move to Trash.
export function EntityActions({
  entity,
  exportable,
  onTogglePin,
  onTrash,
  className,
}: {
  entity: Entity;
  exportable: boolean;
  onTogglePin: () => void;
  onTrash: () => void;
  className?: string;
}) {
  const noun = exportable ? "Page" : labelForType(entity.type);
  const pinLabel = entity.pinned ? `Unpin ${noun}` : `Pin ${noun}`;

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {exportable && <PageExportMenu entity={entity} />}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={pinLabel} onClick={onTogglePin}>
            {entity.pinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{entity.pinned ? "Unpin" : "Pin"}</TooltipContent>
      </Tooltip>
      {/* Non-modal: a modal menu handing focus to the trash AlertDialog leaves
          `pointer-events: none` stuck on the body in Radix. */}
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <IconDots size={15} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onTogglePin}>
            {entity.pinned ? (
              <IconPinFilled size={14} className="text-muted-foreground" />
            ) : (
              <IconPin size={14} className="text-muted-foreground" />
            )}
            {pinLabel}
          </DropdownMenuItem>
          {exportable && (
            <>
              <DropdownMenuSeparator />
              <CopyPageMarkdownItem entity={entity} />
              <DropdownMenuItem onSelect={() => savePageMarkdownFile(entity)}>
                <IconFileDownload size={14} className="text-muted-foreground" />
                Save as Markdown file...
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onTrash}>
            <IconTrash size={14} className="text-destructive" />
            {/* Red only while highlighted; the item's `destructive` variant would keep it red always. */}
            <span className="in-data-highlighted:text-destructive">Move {noun} to Trash</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
