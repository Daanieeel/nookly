import { EntityDetailLayout } from "@/components/entity-detail-layout";
import type { Entity } from "@/lib/api/types";
import { BlockEditor } from "./BlockEditor";

/// Shared body for Notes, Jots and Refinements (§5.2/§5.3) — all three are just
/// pages of blocks under a different entity type. The page IS the canvas (§2.3):
/// no sidebar-list-plus-detail-pane split, just full-width document flow.
export function PageDetailView({ entity }: { entity: Entity }) {
  return (
    <EntityDetailLayout entity={entity} exportable>
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <BlockEditor entityId={entity.id} spaceId={entity.spaceId} />
      </div>
    </EntityDetailLayout>
  );
}
