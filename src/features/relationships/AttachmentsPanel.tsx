import { IconPaperclip, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import { createRelationship, deleteRelationship, listRelationships } from "@/lib/api/relationships";
import type { Entity } from "@/lib/api/types";
import { EntityRow } from "./EntityRow";

/// Right sidebar, section 2 of 3 (§3.5). Attachments are just `attached-file`
/// relationships (§1.5) — bidirectional for free via the relationship graph (§3.6).
export function AttachmentsPanel({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", entity.id],
    queryFn: () => listRelationships(entity.id, "both"),
  });

  const create = useMutation({
    mutationFn: (toEntityId: string) => createRelationship(entity.id, toEntityId, "attached-file"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", entity.id] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRelationship(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", entity.id] }),
  });

  const attachments = relationships.filter((r) => r.relationshipType === "attached-file");
  const isFile = entity.type === "file" || entity.type === "bookmark";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Attachments</h3>
      </div>

      {!isFile && (
        <EntityPickerPopover
          spaceId={entity.spaceId}
          exclude={entity.id}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start gap-1.5">
              <IconPaperclip size={14} /> Attach file or bookmark…
            </Button>
          }
          onSelect={(target) => create.mutate(target.id)}
        />
      )}

      {attachments.length === 0 && <p className="text-xs text-muted-foreground">No attachments.</p>}

      <div className="flex flex-col gap-0.5">
        {attachments.map((r) => {
          const isOutgoing = r.fromEntityId === entity.id;
          const otherId = isOutgoing ? r.toEntityId : r.fromEntityId;
          return (
            <div key={r.id} className="group flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <EntityRow
                  entityId={otherId}
                  currentSpaceId={entity.spaceId}
                  label={isOutgoing ? undefined : "attached to"}
                />
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(r.id)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
              >
                <IconX size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
