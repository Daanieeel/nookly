import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CourseSemesterPanel } from "@/features/courses/CourseSemesterPanel";
import { AttachmentsPanel } from "@/features/relationships/AttachmentsPanel";
import { MentionedPanel } from "@/features/relationships/MentionedPanel";
import { RelationshipsPanel } from "@/features/relationships/RelationshipsPanel";
import type { Entity } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";

/// Fixed section order (§3.5): Relationships, then Attachments, then Mentioned.
/// A Course additionally gets a bespoke Semester-assignment section ahead of
/// Relationships (still the same underlying `course-semester` relationship,
/// just a purpose-built picker instead of a generic row — bespoke-UI pillar,
/// §01). Collapsed state persists across sessions (same convention as the
/// main `AppSidebar`'s own `sidebarCollapsed`) — a slim rail with just the
/// expand toggle, not hidden entirely, so it's always one click away.
export function RightSidebar({
  entity,
  actions,
}: {
  entity: Entity;
  /// Entity actions (export/pin/more), laid out for this sidebar via `className`.
  actions: (className?: string) => React.ReactNode;
}) {
  const collapsed = useNavStore((s) => s.rightSidebarCollapsed);
  const setCollapsed = useNavStore((s) => s.setRightSidebarCollapsed);

  if (collapsed) {
    return (
      <div className="hidden w-15 shrink-0 flex-col items-center border-l border-border p-3 lg:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)}>
              <IconLayoutSidebarRightExpand size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Expand sidebar</TooltipContent>
        </Tooltip>
        {actions("mt-2 flex-col")}
      </div>
    );
  }

  return (
    <div className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-3 lg:flex">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)}>
              <IconLayoutSidebarRightCollapse size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Collapse sidebar</TooltipContent>
        </Tooltip>
        {actions()}
      </div>
      {entity.type === "course" && <CourseSemesterPanel course={entity} />}
      <RelationshipsPanel entity={entity} />
      <AttachmentsPanel entity={entity} />
      <MentionedPanel entity={entity} />
    </div>
  );
}
