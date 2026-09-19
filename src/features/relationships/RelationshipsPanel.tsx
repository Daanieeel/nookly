import { IconPlus, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  createRelationship,
  deleteRelationship,
  listRelationships,
  listRelationshipTypes,
} from "@/lib/api/relationships";
import type { Entity } from "@/lib/api/types";
import { EntityRow } from "./EntityRow";

/// Right sidebar, section 1 of 3 (§3.5) — every relationship except attachments,
/// which the Attachments panel below covers on its own.
export function RelationshipsPanel({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const [pickingType, setPickingType] = useState<string | null>(null);

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", entity.id],
    queryFn: () => listRelationships(entity.id, "both"),
  });
  const { data: types = [] } = useQuery({
    queryKey: ["relationship-types"],
    queryFn: listRelationshipTypes,
  });

  const create = useMutation({
    mutationFn: (vars: { toEntityId: string; relationshipType: string }) =>
      createRelationship(entity.id, vars.toEntityId, vars.relationshipType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", entity.id] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRelationship(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", entity.id] }),
  });

  const visible = relationships.filter((r) => r.relationshipType !== "attached-file");
  const pickableTypes = types.filter((t) => t.name !== "attached-file");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Relationships</h3>
        <Select value={pickingType ?? undefined} onValueChange={setPickingType}>
          <SelectTrigger
            size="sm"
            className="h-6 w-6 justify-center border-none bg-transparent p-0 shadow-none [&>svg]:hidden"
          >
            <IconPlus size={14} />
          </SelectTrigger>
          <SelectContent>
            {pickableTypes.map((t) => (
              <SelectItem key={t.name} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pickingType && (
        <EntityPickerPopover
          spaceId={entity.spaceId}
          exclude={entity.id}
          trigger={
            <Button variant="outline" size="sm" className="w-full justify-start">
              Link "{pickingType}" to…
            </Button>
          }
          onSelect={(target) => {
            create.mutate({ toEntityId: target.id, relationshipType: pickingType });
            setPickingType(null);
          }}
        />
      )}

      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground">No relationships yet.</p>
      )}

      <div className="flex flex-col gap-0.5">
        {visible.map((r) => {
          const isFrom = r.fromEntityId === entity.id;
          const otherId = isFrom ? r.toEntityId : r.fromEntityId;
          const def = types.find((t) => t.name === r.relationshipType);
          const label = isFrom ? r.relationshipType : (def?.inverseLabel ?? r.relationshipType);
          return (
            <div key={r.id} className="group flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <EntityRow entityId={otherId} currentSpaceId={entity.spaceId} label={label} />
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(r.id)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
              >
                <IconX size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
