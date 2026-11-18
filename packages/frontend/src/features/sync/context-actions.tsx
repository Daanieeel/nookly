import { SHAREABLE_TYPES, isSharedSpace } from "@nookly/shared/api";
import { IconUsers } from "@tabler/icons-react";
import { registerActions } from "#/components/context-menu/registry.ts";
import { ShareDialog } from "./ShareDialog.tsx";
import { syncRuntime } from "./sync-instance.ts";

registerActions("entity", [
  {
    id: "share-with-people",
    group: "share",
    label: "Share with People",
    icon: IconUsers,
    when: ({ entity }) =>
      syncRuntime.store.getState().user !== null &&
      SHAREABLE_TYPES.some((type) => type === entity.type) &&
      !isSharedSpace(entity.spaceId) &&
      !entity.deletedAt,
    run: ({ entity }, helpers) =>
      helpers.openDialog((close) => (
        <ShareDialog entity={entity} open onOpenChange={(open) => !open && close()} />
      )),
  },
]);
