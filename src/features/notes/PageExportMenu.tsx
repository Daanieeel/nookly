import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { exportPageMarkdown, renderPageMarkdown } from "@/lib/api/notes";
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

function markdownFileName(entity: Entity): string {
  const base = displayTitle(entity)
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return `${base || "Untitled"}.md`;
}

/// Stays open on click and confirms in place instead of with a toast. `CopyButton`
/// needs the markdown up front, so it's fetched when the menu opens (menu content
/// only mounts while open, so each open refetches). The label turns green by keying
/// off the `text-positive` class `CopyButton` puts on its check icon, so both
/// change on the same frame without reaching into the primitive's state.
export function CopyPageMarkdownItem({ entity }: { entity: Entity }) {
  const { data: markdown } = useQuery({
    queryKey: ["page-markdown", entity.id],
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

export async function savePageMarkdownFile(entity: Entity) {
  const path = await save({
    defaultPath: markdownFileName(entity),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return;
  try {
    await exportPageMarkdown(entity.id, path);
    toast.success("Markdown file saved");
  } catch {
    toast.error("Couldn't save markdown file");
  }
}

export function PageExportMenu({ entity }: { entity: Entity }) {
  return (
    <DropdownMenu>
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
        <DropdownMenuItem onSelect={() => savePageMarkdownFile(entity)}>
          <IconFileDownload size={14} className="text-muted-foreground" />
          Save as Markdown file...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
