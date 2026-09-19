import { invoke } from "@tauri-apps/api/core";
import type { Relationship, RelationshipDirection, RelationshipTypeInfo } from "./types";

export function createRelationship(
  fromEntityId: string,
  toEntityId: string,
  relationshipType: string,
  fromBlockId: string | null = null,
  toBlockId: string | null = null,
): Promise<Relationship> {
  return invoke("create_relationship", {
    fromEntityId,
    toEntityId,
    relationshipType,
    fromBlockId,
    toBlockId,
  });
}

export function listRelationships(
  entityId: string,
  direction: RelationshipDirection = "both",
): Promise<Relationship[]> {
  return invoke("list_relationships", { entityId, direction });
}

export function deleteRelationship(id: string): Promise<void> {
  return invoke("delete_relationship", { id });
}

export function listRelationshipTypes(): Promise<RelationshipTypeInfo[]> {
  return invoke("list_relationship_types");
}
