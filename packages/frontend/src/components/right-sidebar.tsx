import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from "@tabler/icons-react";
import { type CSSProperties, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { CourseSemesterPanel } from "#/features/courses/CourseSemesterPanel.tsx";
import { RefineJotButton } from "#/features/notes/RefineJotButton.tsx";
import { AttachmentsPanel } from "#/features/relationships/AttachmentsPanel.tsx";
import { MentionedInPanel } from "#/features/relationships/MentionedInPanel.tsx";
import { MentionedPanel } from "#/features/relationships/MentionedPanel.tsx";
import { RelationshipsPanel } from "#/features/relationships/RelationshipsPanel.tsx";
import type { Entity } from "#/lib/api/types.ts";
import {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useNavStore,
} from "#/lib/store/nav.ts";

const KEYBOARD_STEP_PX = 16;

/// Fixed section order (§1.5): Relationships, Attachments, Mentioned, Mentioned in.
/// A Jot gets a Refine into New Note button above everything else.
/// A Course additionally gets a bespoke Semester-assignment section ahead of
/// Relationships (still the same underlying `course-semester` relationship,
/// just a purpose-built picker instead of a generic row — bespoke-UI pillar,
/// §01). Collapsed state persists across sessions (same convention as the
/// main `AppSidebar`'s own `sidebarCollapsed`) — a slim rail with just the
/// expand toggle, not hidden entirely, so it's always one click away.
export function RightSidebar({
  entity,
  actions,
  children,
}: {
  entity: Entity;
  /// Entity actions (export/pin/more), laid out for this sidebar via `className`.
  actions: (className?: string) => React.ReactNode;
  /// Type specific sections ahead of the shared ones, e.g. a Task's properties.
  children?: React.ReactNode;
}) {
  const collapsed = useNavStore((s) => s.rightSidebarCollapsed);
  const setCollapsed = useNavStore((s) => s.setRightSidebarCollapsed);
  const storedWidth = useNavStore((s) => s.rightSidebarWidth);
  const setStoredWidth = useNavStore((s) => s.setRightSidebarWidth);
  // Live width while dragging; persisted once on release instead of on every move.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;

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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    // The sidebar sits on the right, so dragging left widens it.
    const onMove = (move: PointerEvent) => {
      latest = clampRightSidebarWidth(startWidth + startX - move.clientX);
      setDragWidth(latest);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setStoredWidth(latest);
      setDragWidth(null);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      className="relative hidden w-(--right-sidebar-width) shrink-0 lg:flex"
      // SAFETY: `--right-sidebar-width` only ever receives a clamped pixel width.
      style={{ "--right-sidebar-width": `${width}px` } as CSSProperties}
    >
      <div
        // Hit area is `w-3`; the visible line is the 4px `before:` bar.
        // A focusable splitter is the WAI-ARIA window splitter pattern; `<hr>` can't be interactive.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={RIGHT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={RIGHT_SIDEBAR_MAX_WIDTH}
        tabIndex={0}
        title="Drag to resize, double click to reset"
        onPointerDown={onPointerDown}
        onDoubleClick={() => setStoredWidth(RIGHT_SIDEBAR_DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setStoredWidth(width + KEYBOARD_STEP_PX);
          else if (event.key === "ArrowRight") setStoredWidth(width - KEYBOARD_STEP_PX);
          else return;
          event.preventDefault();
        }}
        className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-1 before:-translate-x-1/2 before:transition-colors hover:before:bg-primary/50 focus-visible:before:bg-primary/50 active:before:bg-primary"
      />
      {/* Full height for the border and resize handle; sections stay anchored at the top. */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto border-l border-border p-3">
        <div className="flex items-center justify-between gap-2">
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
        {entity.type === "jot" && <RefineJotButton jot={entity} />}
        {children}
        {entity.type === "course" && <CourseSemesterPanel course={entity} />}
        <RelationshipsPanel entity={entity} />
        <AttachmentsPanel entity={entity} />
        <MentionedPanel entity={entity} />
        <MentionedInPanel entity={entity} />
      </div>
    </div>
  );
}
