import { RELATIONSHIP_TYPES, type RelationshipType } from "@nookly/shared/data";

/// What gets attached: a File or a Bookmark, never the item it is attached to.
const ATTACHABLE = new Set(["file", "bookmark"]);

/// The kinds of link a person can make from an item of `entityType`, as the desktop offers
/// them: "Sequel of" only from a course, and "Attached file" never from a file or bookmark.
export function linkKinds(entityType: string | undefined): RelationshipType[] {
  return RELATIONSHIP_TYPES.filter(
    (t) =>
      t.creatable &&
      (t.fromType === null || t.fromType === entityType) &&
      !(t.name === "attached-file" && entityType !== undefined && ATTACHABLE.has(entityType)),
  );
}

/// Whether an item of `targetType` can be the other end of a link of `kind`.
export function fitsLink(kind: RelationshipType | undefined, targetType: string): boolean {
  if (!kind) return true;
  if (kind.name === "attached-file") return ATTACHABLE.has(targetType);
  return kind.toType === null || kind.toType === targetType;
}
