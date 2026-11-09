import { qk } from "#/lib/query-keys.ts";
import { IconArrowUp, IconPaperclip, IconPlus, IconUpload } from "@tabler/icons-react";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  statusOf,
} from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { ReferenceStateBadge } from "#/features/references/ReferenceStateBadge.tsx";
import { getEntity } from "#/lib/api/entities.ts";
import { getFile, importFile, referenceFile } from "#/lib/api/files.ts";
import {
  createRelationship,
  deleteRelationship,
  listRelationships,
} from "#/lib/api/relationships.ts";
import type { Entity } from "#/lib/api/types.ts";
import { localPath } from "#/lib/local-path.ts";
import { TypeGroups } from "./EntityGroups";
import { EntityRow } from "./EntityRow";
import { RemoveLinkButton } from "./RemoveLinkButton";
import { SidebarHint, SidebarSection } from "./SidebarSection";

function refreshAttachments(queryClient: QueryClient, entity: Entity) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.relationships.of(entity.id) }),
    queryClient.invalidateQueries({ queryKey: qk.files.bySpace(entity.spaceId) }),
    queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(entity.spaceId) }),
  ]);
}

/// A typed or pasted path, the same text the Files bar takes. The file is referenced where it
/// lives (copying it into Nookly is one click on its page) and attached to `entity`.
function PathField({ entity, close }: { entity: Entity; close: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const attach = useMutation({
    mutationFn: async (value: string) => {
      const path = await localPath(value);
      if (!path) throw new Error("That isn't a file path. Paste a path like /Users/you/file.pdf");
      const file = await referenceFile(entity.spaceId, path);
      await createRelationship(entity.id, file.entity.id, "attached-file");
    },
    onSuccess: close,
    onSettled: () => refreshAttachments(queryClient, entity),
  });
  const error = attach.error instanceof Error ? attach.error.message : null;
  const empty = text.trim() === "";
  return (
    <form
      className="border-b border-border"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty && !attach.isPending) attach.mutate(text);
      }}
    >
      <div className="flex items-center pr-1">
        <input
          aria-label="File path"
          placeholder="Paste a file path…"
          aria-invalid={error !== null || undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (attach.isError) attach.reset();
          }}
          className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        {(!empty || attach.isPending) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" variant="ghost" size="iconSm" aria-label="Attach by Path">
                <StatusIcon status={statusOf(attach)} idle={<IconArrowUp />} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach by Path</TooltipContent>
          </Tooltip>
        )}
      </div>
      {error && (
        <div className="px-3 pb-2">
          <FieldError message={error} />
        </div>
      )}
    </form>
  );
}

/// Whether this device finds an attached file. Quiet for a stored copy that is fine, so only
/// a pointer to a file elsewhere, or a file that cannot be found, carries a badge.
function AttachedFileState({ entityId }: { entityId: string }) {
  // The row beside it reads the same entity, so this costs no extra lookup.
  const { data: entity } = useQuery({
    queryKey: qk.entity.byId(entityId),
    queryFn: () => getEntity(entityId),
  });
  const { data: file } = useQuery({
    enabled: entity?.type === "file",
    queryKey: qk.files.byId(entityId),
    queryFn: () => getFile(entityId),
  });
  const status = file?.availability;
  if (!file || !status) return null;
  if (!file.reference && status.state === "available") return null;
  return (
    <div className="shrink-0">
      <ReferenceStateBadge status={status} provider={file.reference?.provider ?? "file"} />
    </div>
  );
}

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
    onSettled: () => refreshAttachments(queryClient, entity),
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
            <>
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
              <PathField entity={entity} close={close} />
            </>
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
            <AttachedFileState entityId={a.entityId} />
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
