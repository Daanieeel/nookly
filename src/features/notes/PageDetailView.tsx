import { IconDownload } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { Button } from "@/components/ui/button";
import { renderPageMarkdown } from "@/lib/api/notes";
import type { Entity } from "@/lib/api/types";
import { BlockEditor } from "./BlockEditor";

/// Shared body for Notes, Jots and Refinements (§5.2/§5.3) — all three are just
/// pages of blocks under a different entity type. The page IS the canvas (§2.3):
/// no sidebar-list-plus-detail-pane split, just full-width document flow.
export function PageDetailView({ entity }: { entity: Entity }) {
  const exportMarkdown = useMutation({
    mutationFn: () => renderPageMarkdown(entity.id),
    onSuccess: (markdown) => navigator.clipboard.writeText(markdown),
  });

  return (
    <EntityDetailLayout entity={entity}>
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="mb-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => exportMarkdown.mutate()}
          >
            <IconDownload size={14} />
            {exportMarkdown.isSuccess ? "Copied markdown!" : "Export as Markdown"}
          </Button>
        </div>
        <BlockEditor entityId={entity.id} spaceId={entity.spaceId} />
      </div>
    </EntityDetailLayout>
  );
}
