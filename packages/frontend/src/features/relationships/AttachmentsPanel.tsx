import { qk } from "#/lib/query-keys.ts";
import { IconPaperclip, IconPlus, IconUpload } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@nookly/ui/components/button";
import { importFile } from "#/lib/api/files.ts";
import {
  createRelationship,
  deleteRelationship,
  listRelationships,
} from "#/lib/api/relationships.ts";
import type { Entity } from "#/lib/api/types.ts";
import { TypeGroups } from "./EntityGroups";
import { EntityRow } from "./EntityRow";
import { RemoveLinkButton } from "./RemoveLinkButton";
import { SidebarHint, SidebarSection } from "./SidebarSection";

/// Right sidebar, section 2 of 4 (§1.5). Attachments are just `attached-file`
/// relationships (§1.5) — bidirectional for free via the relationship graph (§3.6).
export function AttachmentsPanel({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const { data: relationships = [] } = useQuery({
    queryKey: qk.relationships.of(entity.id),
    queryFn: () => listRelationships(entity.id, "both"),
  });

  const create = useMutation({
    mutationFn: (toEntityId: string) => createRelationship(entity.id, toEntityId, "attached-file"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.relationships.of(entity.id) }),
  });
  /// Copies the picked files into this Space and attaches each to the page.
  const upload = useMutation({
    mutationFn: async () => {
      const picked = await open({ multiple: true, directory: false });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const files = await Promise.all(paths.map((path) => importFile(entity.spaceId, path)));
      await Promise.all(
        files.map((f) => createRelationship(entity.id, f.entity.id, "attached-file")),
      );
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.relationships.of(entity.id) }),
        queryClient.invalidateQueries({ queryKey: qk.files.bySpace(entity.spaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(entity.spaceId) }),
      ]),
  });
  // The new row appearing is the confirmation, so the trigger shows no success state.
  const attachStatus = [create, upload].find((m) => m.isPending || m.isError);
  const createStatus = attachStatus ? statusOf(attachStatus) : "idle";

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
          header={(close) => (
            <div className="border-b border-border p-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 px-2 font-normal [&_svg]:size-3.5"
                onClick={() => {
                  close();
                  upload.mutate();
                }}
              >
                <IconUpload size={14} />
                Upload File
              </Button>
            </div>
          )}
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

      <TypeGroups
        items={attachments.map((r) => {
          const isOutgoing = r.fromEntityId === entity.id;
          return {
            key: r.id,
            entityId: isOutgoing ? r.toEntityId : r.fromEntityId,
            label: isOutgoing ? undefined : "attached to",
          };
        })}
        renderRow={(a) => (
          <div className="group flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <EntityRow entityId={a.entityId} currentSpaceId={entity.spaceId} label={a.label} />
            </div>
            <RemoveLinkButton
              label="Remove attachment"
              errorLabel="Couldn't remove attachment, try again"
              onRemove={async () => {
                await deleteRelationship(a.key);
                await queryClient.invalidateQueries({
                  queryKey: qk.relationships.of(entity.id),
                });
              }}
            />
          </div>
        )}
      />
    </SidebarSection>
  );
}
