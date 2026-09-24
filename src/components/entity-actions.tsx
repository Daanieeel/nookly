import { IconDots, IconNotes, IconPin, IconPinFilled, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { type ActionStatus, StatusAnnouncer, StatusIcon } from "@/components/action-feedback";
import { FeedbackMenuItem } from "@/components/feedback-menu-item";
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
  SaveMarkdownFileItem,
} from "@/features/notes/PageExportMenu";
import { refineJotIntoNote } from "@/features/notes/refine-jot";
import type { Entity } from "@/lib/api/types";
import { labelForType } from "@/lib/entity-title";
import { cn } from "@/lib/utils";

/// Export (pages only), Pin, and an overflow menu repeating both plus Move to Trash
/// (and, for Jots, Refine into New Note).
/// Pin's own success is the icon swapping state; pending and errors show on the
/// control that was used.
export function EntityActions({
  entity,
  exportable,
  pin,
  onTrash,
  className,
}: {
  entity: Entity;
  exportable: boolean;
  pin: { status: ActionStatus; toggle: () => Promise<void> };
  onTrash: () => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const noun = exportable ? "Page" : labelForType(entity.type);
  const pinLabel = entity.pinned ? `Unpin ${noun}` : `Pin ${noun}`;
  const pinIcon = (size: number, className?: string) =>
    entity.pinned ? (
      <IconPinFilled size={size} className={className} />
    ) : (
      <IconPin size={size} className={className} />
    );
  const pinError = entity.pinned ? "Couldn't unpin, try again" : "Couldn't pin, try again";

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {exportable && <PageExportMenu entity={entity} />}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={pin.status === "error" ? pinError : pinLabel}
            onClick={() => {
              if (pin.status !== "pending") void pin.toggle().catch(() => {});
            }}
          >
            {pin.status === "success" ? (
              pinIcon(15)
            ) : (
              <StatusIcon status={pin.status} idle={pinIcon(15)} size={15} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {pin.status === "error" ? pinError : entity.pinned ? "Unpin" : "Pin"}
        </TooltipContent>
      </Tooltip>
      <StatusAnnouncer message={pin.status === "error" ? pinError : null} />
      {/* Non-modal: a modal menu handing focus to the trash AlertDialog leaves
          `pointer-events: none` stuck on the body in Radix. */}
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
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
          {entity.type === "jot" && (
            <>
              <FeedbackMenuItem
                icon={<IconNotes size={14} className="text-muted-foreground" />}
                label="Refine into New Note"
                successLabel="Note created"
                errorLabel="Couldn't create Note, try again"
                action={async () => {
                  await refineJotIntoNote(entity, queryClient);
                }}
                onDone={closeMenu}
              />
              <DropdownMenuSeparator />
            </>
          )}
          <FeedbackMenuItem
            icon={pinIcon(14, "text-muted-foreground")}
            label={pinLabel}
            successLabel={entity.pinned ? `${noun} pinned` : `${noun} unpinned`}
            errorLabel={pinError}
            action={pin.toggle}
            onDone={closeMenu}
          />
          {exportable && (
            <>
              <DropdownMenuSeparator />
              <CopyPageMarkdownItem entity={entity} />
              <SaveMarkdownFileItem entity={entity} onDone={closeMenu} />
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onTrash}>
            <IconTrash size={14} className="text-destructive" />
            Move {noun} to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
