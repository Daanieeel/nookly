import { SHAREABLE_TYPES } from "@nookly/shared/api";
import { IconUsers } from "@tabler/icons-react";
import { registerActions } from "#/components/context-menu/registry.ts";
import type { Entity } from "#/lib/api/types.ts";
import { ShareDialog } from "./ShareDialog.tsx";
import { syncRuntime } from "./sync-instance.ts";

/// A page someone shared with this account lives in a Space of their own, named
/// `shared-<owner>`; only its owner can share it on.
export function isSharedWithMe(entity: Entity): boolean {
  return entity.spaceId.startsWith("shared-");
}

registerActions("entity", [
  {
    id: "share-with-people",
    group: "share",
    label: "Share with People",
    icon: IconUsers,
    when: ({ entity }) =>
      syncRuntime.store.getState().user !== null &&
      SHAREABLE_TYPES.some((type) => type === entity.type) &&
      !isSharedWithMe(entity) &&
      !entity.deletedAt,
    run: ({ entity }, helpers) =>
      helpers.openDialog((close) => (
        <ShareDialog entity={entity} open onOpenChange={(open) => !open && close()} />
      )),
  },
]);
