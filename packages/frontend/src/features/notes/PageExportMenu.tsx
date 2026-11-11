import { qk } from "#/lib/query-keys.ts";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { renderPageMarkdown } from "#/lib/api/notes.ts";
import { ExportPageDialog } from "#/features/page-export/ExportPageDialog.tsx";
import { SaveNooklyFileItem } from "#/features/portable/save-nookly-file.tsx";
import type { Entity } from "#/lib/api/types.ts";

/// Stays open on click and confirms in place. `CopyButton`
/// needs the markdown up front, so it's fetched when the menu opens (menu content
/// only mounts while open, so each open refetches). The label turns green by keying
/// off the `text-positive` class `CopyButton` puts on its check icon, so both
/// change on the same frame without reaching into the primitive's state.
export function CopyPageMarkdownItem({ entity }: { entity: Entity }) {
  const { data: markdown } = useQuery({
    queryKey: qk.pageMarkdown(entity.id),
    queryFn: () => renderPageMarkdown(entity.id),
    staleTime: 0,
  });

  return (
    <DropdownMenuItem
      asChild
      disabled={markdown === undefined}
      onSelect={(event) => event.preventDefault()}
    >
      <CopyButton
        value={markdown ?? ""}
        className="w-full flex-row-reverse justify-end has-[.text-positive]:text-positive focus:has-[.text-positive]:text-positive [&>svg:not(.text-positive)]:text-muted-foreground"
      >
        Copy Page as Markdown
      </CopyButton>
    </DropdownMenuItem>
  );
}

/// Opens the Export dialog, where the page saves as PDF, Word, OpenDocument or Markdown.
export function ExportPageItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <IconFileDownload size={14} className="text-muted-foreground" />
      Export...
    </DropdownMenuItem>
  );
}

export function PageExportMenu({ entity }: { entity: Entity }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Non-modal: a modal menu handing focus to a dialog leaves `pointer-events: none`
          stuck on the body in Radix. */}
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Export">
                <IconDownload size={15} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Export</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <CopyPageMarkdownItem entity={entity} />
          <ExportPageItem onSelect={() => setExporting(true)} />
          <SaveNooklyFileItem entity={entity} onDone={close} />
        </DropdownMenuContent>
      </DropdownMenu>
      {exporting && <ExportPageDialog entity={entity} open onOpenChange={setExporting} />}
    </>
  );
}
