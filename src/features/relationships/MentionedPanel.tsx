import { useQuery } from "@tanstack/react-query";
import { listBlocks, listMentioningEntities } from "@/lib/api/notes";
import type { Entity } from "@/lib/api/types";
import { EntityRow } from "./EntityRow";
import { extractMentionIds } from "./mention-utils";

/// Right sidebar, section 3 of 3 (§3.5) — inline `@mention` references, both
/// directions: "Mentioned" is this page's own outgoing mentions (found in its
/// block content), "Mentioned in" is the reverse — every other entity whose
/// block content mentions this one. "Mentioned" is empty for entity types with
/// no blocks (only Notes/Jots/Refinements have any), which falls out naturally
/// with no type-checking needed; "Mentioned in" can be non-empty for any type
/// since anything can be the target of an `@mention`.
export function MentionedPanel({ entity }: { entity: Entity }) {
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", entity.id],
    queryFn: () => listBlocks(entity.id),
  });
  const { data: mentionedIn = [] } = useQuery({
    queryKey: ["mentioning-entities", entity.id],
    queryFn: () => listMentioningEntities(entity.id),
  });

  const mentionIds = extractMentionIds(blocks.map((b) => b.content).join("\n"));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">Mentioned</h3>
        {mentionIds.length === 0 && <p className="text-xs text-muted-foreground">No mentions.</p>}
        <div className="flex flex-col gap-0.5">
          {mentionIds.map((id) => (
            <EntityRow key={id} entityId={id} currentSpaceId={entity.spaceId} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">Mentioned in</h3>
        {mentionedIn.length === 0 && (
          <p className="text-xs text-muted-foreground">Not mentioned anywhere.</p>
        )}
        <div className="flex flex-col gap-0.5">
          {mentionedIn.map((e) => (
            <EntityRow key={e.id} entityId={e.id} currentSpaceId={entity.spaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}
