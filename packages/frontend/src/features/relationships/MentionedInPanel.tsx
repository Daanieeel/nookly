import { IconArrowBackUp } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { listMentioningEntities } from "#/lib/api/notes.ts";
import type { Entity } from "#/lib/api/types.ts";
import { EntityRow } from "./EntityRow";
import { SidebarHint, SidebarSection } from "./SidebarSection";

/// Right sidebar, section 4 of 4 (§1.5): backlinks, the reverse of Mentioned.
/// Every other page whose content `@mention`s this entity, read from the backend's
/// `mentions` index. Any entity type can be a mention target, so this applies to all.
export function MentionedInPanel({ entity }: { entity: Entity }) {
  const { data: mentionedIn = [] } = useQuery({
    queryKey: ["mentioning-entities", entity.id],
    queryFn: () => listMentioningEntities(entity.id),
  });

  return (
    <SidebarSection
      icon={<IconArrowBackUp size={14} />}
      title="Mentioned in"
      count={mentionedIn.length}
    >
      {mentionedIn.length === 0 ? (
        <SidebarHint>Nothing references this yet.</SidebarHint>
      ) : (
        <div className="flex flex-col gap-0.5">
          {mentionedIn.map((e) => (
            <EntityRow key={e.id} entityId={e.id} currentSpaceId={entity.spaceId} />
          ))}
        </div>
      )}
    </SidebarSection>
  );
}
