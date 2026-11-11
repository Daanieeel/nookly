import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { notify } from "#/components/notify.tsx";
import { restoreEntity, softDeleteEntity } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { labelForType } from "#/lib/entity-title.ts";
import { ignoreError, logger } from "#/lib/log.ts";
import { refreshDatabaseData } from "#/lib/refresh-data.ts";

export interface TrashEntityOptions {
  /// Refetches what the move (or the undo) changed.
  refresh: () => Promise<void>;
  /// Follow-up once the item is in Trash, such as leaving its page.
  onTrashed?: () => void;
  /// Follow-up once Undo has brought the item back, such as returning to its page.
  onUndone?: () => void;
}

/// Moves an item to Trash with no confirmation: it is a soft delete, so a toast with
/// Undo is all the safety it needs, and Trash holds it after that. Never rejects; a
/// failure shows its own toast.
export async function trashEntity(
  entity: Entity,
  { refresh, onTrashed, onUndone }: TrashEntityOptions,
): Promise<void> {
  try {
    await softDeleteEntity(entity.id);
  } catch (error) {
    logger.error("trash", "Couldn't move an item to Trash", error);
    notify.error("Couldn't move to Trash", { description: "Try again in a moment." });
    return;
  }
  onTrashed?.();
  await refresh().catch(ignoreError("refreshing after moving to Trash"));
  notify.success(`${labelForType(entity.type)} moved to Trash`, {
    action: { label: "Undo", onClick: () => void undo(entity, { refresh, onUndone }) },
  });
}

async function undo(
  entity: Entity,
  { refresh, onUndone }: Pick<TrashEntityOptions, "refresh" | "onUndone">,
): Promise<void> {
  try {
    await restoreEntity(entity.id);
  } catch (error) {
    logger.error("trash", "Couldn't undo a move to Trash", error);
    notify.error("Couldn't restore from Trash", {
      description: "It is still in Trash, where you can restore it.",
    });
    return;
  }
  await refresh().catch(ignoreError("refreshing after undoing a move to Trash"));
  onUndone?.();
}

/// `trashEntity` refreshing all database data afterwards.
export function useTrashEntity() {
  const queryClient = useQueryClient();
  return useCallback(
    (entity: Entity, options: Omit<TrashEntityOptions, "refresh"> = {}) =>
      trashEntity(entity, { ...options, refresh: () => refreshDatabaseData(queryClient) }),
    [queryClient],
  );
}
