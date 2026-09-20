import { AttachmentsPanel } from "@/features/relationships/AttachmentsPanel";
import { MentionedPanel } from "@/features/relationships/MentionedPanel";
import { RelationshipsPanel } from "@/features/relationships/RelationshipsPanel";
import type { Entity } from "@/lib/api/types";

/// Fixed section order (§3.5): Relationships, then Attachments, then Mentioned.
export function RightSidebar({ entity }: { entity: Entity }) {
  return (
    <div className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-3 lg:flex">
      <RelationshipsPanel entity={entity} />
      <AttachmentsPanel entity={entity} />
      <MentionedPanel entity={entity} />
    </div>
  );
}
