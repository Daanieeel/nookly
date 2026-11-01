import { IconFolder } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { statusOf, useCloseAfterSuccess } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { EntityMention } from "#/components/entity-mention.tsx";
import { LabelsDialog } from "#/components/label-manager.tsx";
import { listEntities } from "#/lib/api/entities.ts";
import { createSpace, deleteSpace, updateSpace } from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import { ACCENT_COLORS } from "#/lib/colors.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { SpaceFormDialog, type SpaceValues, useSpaceForm } from "./space-form-fields.tsx";

/// A dialog opened from a Space's icon, a menu or the row of Spaces. Only one is open at a time,
/// so the sidebar holds it once instead of every icon owning its own.
export type SpaceDialog = { kind: "settings" | "labels" | "delete"; space: Space };

/// Renders the open Space dialog, if any.
export function SpaceDialogs({
  dialog,
  onClose,
}: {
  dialog: SpaceDialog | null;
  onClose: () => void;
}) {
  if (!dialog) return null;
  const { kind, space } = dialog;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  if (kind === "settings") {
    return <SpaceSettingsDialog space={space} open onOpenChange={onOpenChange} />;
  }
  if (kind === "labels") {
    return (
      <LabelsDialog spaceId={space.id} spaceName={space.name} open onOpenChange={onOpenChange} />
    );
  }
  return <DeleteSpaceDialog space={space} onOpenChange={onOpenChange} />;
}

function DeleteSpaceDialog({
  space,
  onOpenChange,
}: {
  space: Space;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  // Counted for the "X items" the dialog shows before anything is deleted.
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(space.id),
    queryFn: () => listEntities(space.id, false),
  });
  const del = useMutation({ mutationFn: () => deleteSpace(space.id) });
  useCloseAfterSuccess(del, () => {
    onOpenChange(false);
    queryClient.invalidateQueries({ queryKey: qk.spaces });
    if ("spaceId" in view && view.spaceId === space.id) setView({ kind: "dashboard" });
  });

  return (
    <ConfirmPermanentDialog
      open
      onOpenChange={onOpenChange}
      title={
        <>
          Delete
          <EntityMention
            icon={space.icon ? renderIconValue(space.icon, 13) : <IconFolder size={13} />}
            label={space.name}
          />
          ?
        </>
      }
      description="This permanently deletes the Space and everything in it, across all its modules. This cannot be undone; nothing goes to Trash."
      stats={[{ value: entities.length, label: entities.length === 1 ? "Item" : "Items" }]}
      phrase={space.name}
      actionLabel="Delete Space"
      successLabel="Space deleted"
      errorLabel="Couldn't delete, try again"
      status={statusOf(del)}
      error={del.isError && del.error.message}
      onConfirm={() => del.mutate()}
    />
  );
}

export function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const setActiveSpace = useNavStore((s) => s.setActiveSpace);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const emptySpace: SpaceValues = { name: "", color: ACCENT_COLORS[0], icon: null };
  const form = useSpaceForm(emptySpace, (value) => {
    if (createStatus === "idle" || createStatus === "error") create.mutate(value);
  });

  useEffect(() => {
    if (open) nameInputRef.current?.focus();
    else form.reset();
  }, [open, form]);

  const create = useMutation({
    mutationFn: ({ name, icon, color }: SpaceValues) => createSpace(name.trim(), icon, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaces }),
  });
  useCloseAfterSuccess(create, () => {
    // The sidebar switches to the new Space.
    if (create.data) setActiveSpace(create.data.id);
    onOpenChange(false);
  });
  const createStatus = statusOf(create);
  const { reset: resetCreate } = create;
  useEffect(() => {
    if (!open) resetCreate();
  }, [open, resetCreate]);

  return (
    <SpaceFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Space"
      form={form}
      nameId="new-space-name"
      nameInputRef={nameInputRef}
      status={createStatus}
      label="Create"
      successLabel="Space created"
      errorLabel="Couldn't create, try again"
    />
  );
}

function SpaceSettingsDialog({
  space,
  open,
  onOpenChange,
}: {
  space: Space;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const current: SpaceValues = { name: space.name, color: space.color, icon: space.icon };
  const form = useSpaceForm(current, (value) => {
    if (saveStatus === "idle" || saveStatus === "error") save.mutate(value);
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: space.name, color: space.color, icon: space.icon });
      nameInputRef.current?.focus();
    }
  }, [open, space, form]);

  const save = useMutation({
    mutationFn: ({ name, icon, color }: SpaceValues) =>
      updateSpace(space.id, { name: name.trim(), icon: icon ?? "", color }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.spaces }),
  });
  useCloseAfterSuccess(save, () => onOpenChange(false));
  const saveStatus = statusOf(save);
  const { reset: resetSave } = save;
  useEffect(() => {
    if (!open) resetSave();
  }, [open, resetSave]);

  return (
    <SpaceFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Space settings"
      form={form}
      nameId="space-settings-name"
      nameInputRef={nameInputRef}
      status={saveStatus}
      label="Save"
      successLabel="Saved"
      errorLabel="Couldn't save, try again"
    />
  );
}
