import { qk } from "#/lib/query-keys.ts";
import { IconAt } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { listBlocks } from "#/lib/api/notes.ts";
import type { Entity } from "#/lib/api/types.ts";
import { TypeGroups } from "./EntityGroups";
import { EntityRow } from "./EntityRow";
import { extractMentionIds } from "./mention-utils";
import { SidebarHint, SidebarSection } from "./SidebarSection";

/// Right sidebar, section 3 of 4 (§1.5): this page's own outgoing inline
/// `@mention`s, found in its block content. Always empty for entity types with
/// no blocks (only Notes/Jots have any), with no type check needed.
export function MentionedPanel({ entity }: { entity: Entity }) {
  const { data: blocks = [] } = useQuery({
    queryKey: qk.blocks(entity.id),
    queryFn: () => listBlocks(entity.id),
  });
  const mentionIds = extractMentionIds(blocks.map((b) => b.content).join("\n"));

  return (
    <SidebarSection icon={<IconAt size={14} />} title="Mentioned" count={mentionIds.length}>
      {mentionIds.length === 0 ? (
        <SidebarHint>Type @ in the page to mention something.</SidebarHint>
      ) : (
        <TypeGroups
          items={mentionIds.map((id) => ({ key: id, entityId: id }))}
          renderRow={(m) => <EntityRow entityId={m.entityId} currentSpaceId={entity.spaceId} />}
        />
      )}
    </SidebarSection>
  );
}
