import { EntityDetailLayout } from "@/components/entity-detail-layout";
import type { Entity } from "@/lib/api/types";
import { formatDateTime } from "@/lib/datetime";

/// Fallback detail body for entity types that don't need bespoke fields beyond
/// the universal base model — everything else (relationships, attachments,
/// mentions) already comes from EntityDetailLayout's right sidebar.
export function GenericDetailView({ entity }: { entity: Entity }) {
  return (
    <EntityDetailLayout entity={entity}>
      <div className="flex max-w-xl flex-col gap-1 text-sm text-muted-foreground">
        <p>Type: {entity.type}</p>
        <p>Created {formatDateTime(entity.createdAt)}</p>
        <p>Updated {formatDateTime(entity.updatedAt)}</p>
      </div>
    </EntityDetailLayout>
  );
}
