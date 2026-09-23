import {
  IconArrowUpRight,
  IconCopyPlus,
  IconFolderShare,
  IconLink,
  IconLinkPlus,
  IconPinned,
  IconPinnedOff,
  IconRestore,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useCloseAfterSuccess } from "@/components/action-feedback";
import { SpaceGlyph } from "@/components/spotlight";
import { TrashEntityDialog } from "@/components/trash-entity-dialog";
import { hiddenRelationshipTypes } from "@/features/relationships/RelationshipsPanel";
import { RelatePicker } from "@/features/relationships/RelatePickerPopover";
import { duplicateEntity, restoreEntity, updateEntity } from "@/lib/api/entities";
import { attachLabel, detachLabel, listLabels, listLabelsForEntity } from "@/lib/api/labels";
import { createRelationship, listRelationshipTypes } from "@/lib/api/relationships";
import { listSpaces } from "@/lib/api/spaces";
import type { Entity } from "@/lib/api/types";
import { copyEntityLink } from "@/lib/clipboard";
import { useNavStore } from "@/lib/store/nav";
import {
  type EntityRecord,
  type EntityTarget,
  type MenuAction,
  type MenuSubItem,
  registerActions,
} from "./registry";
import { PickerFeedback } from "./picker-feedback";

/// The baseline every entity gets for free (custom context menus plan §3). A
/// type's registration can omit any of these by id, or replace one by reusing it.

function isViewing(entity: Entity): boolean {
  const view = useNavStore.getState().view;
  return view.kind === "entity" && view.entityId === entity.id;
}

function useMoveTargets({ entity }: EntityTarget): MenuSubItem[] | undefined {
  const { data: spaces } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  return spaces
    ?.filter((space) => space.id !== entity.spaceId)
    .map((space) => ({
      id: space.id,
      label: space.name,
      icon: <SpaceGlyph space={space} size={14} />,
      run: async (helpers) => {
        await updateEntity(entity.id, { spaceId: space.id });
        // The open page follows its entity into the new Space.
        if (isViewing(entity)) {
          useNavStore
            .getState()
            .setView({ kind: "entity", entityId: entity.id, spaceId: space.id });
        }
        await helpers.refresh();
      },
    }));
}

function RelateFromMenu({
  entity,
  close,
  refresh,
}: {
  entity: Entity;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const { data: types = [] } = useQuery({
    queryKey: ["relationship-types"],
    queryFn: listRelationshipTypes,
  });
  const hidden = hiddenRelationshipTypes(entity);
  const relate = useMutation({
    mutationFn: async (vars: { toEntityId: string; relationshipType: string }) => {
      await createRelationship(entity.id, vars.toEntityId, vars.relationshipType);
      await refresh();
    },
  });
  useCloseAfterSuccess(relate, close);

  return (
    <div className="flex flex-col">
      <RelatePicker
        spaceId={entity.spaceId}
        exclude={entity.id}
        types={types.filter((t) => !hidden.has(t.name))}
        onSelect={(target, relationshipType) => {
          if (!relate.isPending) relate.mutate({ toEntityId: target.id, relationshipType });
        }}
      />
      <PickerFeedback
        pending={relate.isPending}
        pendingLabel="Linking…"
        errorLabel={relate.isError ? "Couldn't link, pick again to retry" : null}
      />
    </div>
  );
}

registerActions("entity", [
  {
    id: "open",
    group: "open",
    label: "Open",
    icon: IconArrowUpRight,
    when: ({ entity }) => !isViewing(entity),
    run: ({ entity }) => useNavStore.getState().openEntity(entity.id, entity.spaceId),
  },
  {
    id: "duplicate",
    group: "edit",
    label: "Duplicate",
    icon: IconCopyPlus,
    run: async ({ entity }, helpers) => {
      await duplicateEntity(entity.id);
      await helpers.refresh();
    },
  },
  {
    id: "pin",
    group: "organize",
    label: ({ entity }) => (entity.pinned ? "Unpin" : "Pin"),
    icon: ({ entity }: EntityTarget) => (entity.pinned ? IconPinnedOff : IconPinned),
    run: async ({ entity }, helpers) => {
      await updateEntity(entity.id, { pinned: !entity.pinned });
      await helpers.refresh();
    },
  },
  {
    id: "relate",
    group: "organize",
    label: "Relate to…",
    icon: IconLinkPlus,
    run: ({ entity }, helpers) =>
      helpers.openPopover((close) => (
        <RelateFromMenu entity={entity} close={close} refresh={helpers.refresh} />
      )),
  },
  {
    id: "move",
    group: "organize",
    label: "Move to Space",
    icon: IconFolderShare,
    useItems: useMoveTargets,
    emptyLabel: "No other Spaces yet",
  },
  {
    id: "copy-link",
    group: "share",
    label: "Copy Link",
    icon: IconLink,
    successLabel: "Link copied",
    run: ({ entity }) => copyEntityLink(entity),
  },
  {
    id: "restore",
    group: "danger",
    label: "Restore",
    icon: IconRestore,
    when: ({ entity }) => Boolean(entity.deletedAt),
    run: async ({ entity }, helpers) => {
      await restoreEntity(entity.id);
      await helpers.refresh();
    },
  },
  {
    id: "delete",
    group: "danger",
    label: "Move to Trash",
    icon: IconTrash,
    destructive: true,
    run: ({ entity }, helpers) =>
      helpers.openDialog((close) => (
        <TrashEntityDialog
          entity={entity}
          open
          onOpenChange={(open) => !open && close()}
          onTrashed={() => {
            if (isViewing(entity)) useNavStore.getState().setView({ kind: "dashboard" });
            void helpers.refresh();
          }}
        />
      )),
  },
]);

/// Labels are a generic system any module can use (docs/02-entity-model.md), so
/// modules that show labels add this one shared submenu instead of their own.
export function labelsAction<TRecord extends EntityRecord>(): MenuAction<EntityTarget<TRecord>> {
  return {
    id: "labels",
    group: "type",
    label: "Labels",
    icon: IconTag,
    useItems: useLabelItems,
    emptyLabel: "No labels in this Space yet",
  };
}

function useLabelItems({ entity }: EntityTarget): MenuSubItem[] | undefined {
  const { data: labels } = useQuery({
    queryKey: ["labels", entity.spaceId],
    queryFn: () => listLabels(entity.spaceId),
  });
  const { data: attached } = useQuery({
    queryKey: ["entity-labels", entity.id],
    queryFn: () => listLabelsForEntity(entity.id),
  });
  if (!labels || !attached) return undefined;
  const attachedIds = new Set(attached.map((l) => l.id));
  return labels.map((label) => {
    const isAttached = attachedIds.has(label.id);
    return {
      id: label.id,
      label: label.name,
      checked: isAttached,
      icon: (
        <span
          className="size-2 shrink-0 rounded-full bg-(--label-color)"
          // SAFETY: `--label-color` only ever receives `label.color`, a plain hex
          // string from the labels API. `CSSProperties` just doesn't model it.
          style={{ "--label-color": label.color } as CSSProperties}
        />
      ),
      run: async (helpers) => {
        if (isAttached) await detachLabel(entity.id, label.id);
        else await attachLabel(entity.id, label.id);
        await helpers.refresh();
      },
    };
  });
}
