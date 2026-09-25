import { IconPaperclip, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  createRelationship,
  deleteRelationship,
  listRelationships,
} from "#/lib/api/relationships.ts";
import type { Entity } from "#/lib/api/types.ts";
import { EntityRow } from "./EntityRow";
import { RemoveLinkButton } from "./RemoveLinkButton";
import { SidebarHint, SidebarSection } from "./SidebarSection";

/// Right sidebar, section 2 of 4 (§1.5). Attachments are just `attached-file`
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
  // The new row appearing is the confirmation, so the trigger shows no success state.
  const createStatus = create.isSuccess ? "idle" : statusOf(create);

  const attachments = relationships.filter((r) => r.relationshipType === "attached-file");
  const isFile = entity.type === "file" || entity.type === "bookmark";

  return (
    <SidebarSection
      icon={<IconPaperclip size={14} />}
      title="Attachments"
      count={attachments.length}
    >
      {!isFile && (
        <EntityPickerPopover
          spaceId={entity.spaceId}
          exclude={entity.id}
          typeFilter={["file", "bookmark"]}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 px-2 font-normal [&_svg]:size-3.5"
            >
              <StatusButtonContent
                status={createStatus}
                icon={<IconPlus size={14} />}
                label="Attach file or bookmark…"
                errorLabel="Couldn't attach, try again"
              />
            </Button>
          }
          onSelect={(target) => create.mutate(target.id)}
        />
      )}

      {isFile && attachments.length === 0 && (
        <SidebarHint>Attach this from any page to see it listed here.</SidebarHint>
      )}

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
              <RemoveLinkButton
                label="Remove attachment"
                errorLabel="Couldn't remove attachment, try again"
                onRemove={async () => {
                  await deleteRelationship(r.id);
                  await queryClient.invalidateQueries({
                    queryKey: ["relationships", entity.id],
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    </SidebarSection>
  );
}
