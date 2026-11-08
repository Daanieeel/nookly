import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from "@tabler/icons-react";
import { type CSSProperties, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { CourseSemesterPanel } from "#/features/courses/CourseSemesterPanel.tsx";
import { RefineJotButton } from "#/features/notes/RefineJotButton.tsx";
import { AttachmentsPanel } from "#/features/relationships/AttachmentsPanel.tsx";
import { LabelsPanel } from "#/features/relationships/LabelsPanel.tsx";
import { MentionedInPanel } from "#/features/relationships/MentionedInPanel.tsx";
import { MentionedPanel } from "#/features/relationships/MentionedPanel.tsx";
import { RelationshipsPanel } from "#/features/relationships/RelationshipsPanel.tsx";
import { PAGE_SECTION_TYPES } from "#/features/page-sections/PageSections.tsx";
import type { Entity } from "#/lib/api/types.ts";
import {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useNavStore,
} from "#/lib/store/nav.ts";
import { FileDropOverlay } from "#/features/files/FileDropOverlay.tsx";
import { isAttachable } from "#/features/files/drop-import.ts";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { useFileDragOver } from "#/hooks/use-file-drag-over.ts";
import { useRightSidebarCollapsed } from "#/components/tab-group-scope.ts";

const KEYBOARD_STEP_PX = 16;

/// The details sidebar toggle shortcut, as keycaps.
function ToggleShortcut() {
  return <ShortcutKbd name="toggleDetailSidebar" />;
}

/// Fixed section order: Attachments, Mentioned, Mentioned in, Relationships.
/// On a page that shows its related items in sections of its body (a Course), the
/// Relationships list folds to a count with every link one click away.
/// Relationships renders last because it's usually the largest section, and
/// putting it first pushed every other section far down the sidebar.
/// A Jot gets a Refine into New Note button above everything else.
/// A Course additionally gets a bespoke Semester-assignment section ahead of
/// Relationships (still the same underlying `course-semester` relationship,
/// just a purpose-built picker instead of a generic row — bespoke-UI pillar,
/// §01).
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
  return (
    <RightSidebarFrame
      actions={actions}
      dropLabel={isAttachable(entity.type) ? "Drop to attach files" : undefined}
    >
      {entity.type === "jot" && (
        <div>
          <RefineJotButton jot={entity} />
        </div>
      )}
      {children}
      {entity.type === "course" && <CourseSemesterPanel course={entity} />}
      {/* Task and Sub-task already show Labels inline in their own properties
          panel (`children` above) — everything else gets it here instead. */}
      {entity.type !== "task" && entity.type !== "sub_task" && <LabelsPanel entity={entity} />}
      <AttachmentsPanel entity={entity} />
      <MentionedPanel entity={entity} />
      <MentionedInPanel entity={entity} />
      <RelationshipsPanel entity={entity} compact={PAGE_SECTION_TYPES.has(entity.type)} />
    </RightSidebarFrame>
  );
}

/// The sidebar's shell, for pages with and without an entity: the collapse toggle, the
/// actions beside it, the resizable width. Collapsed state and width persist across sessions
/// (same convention as the main `AppSidebar`'s own `sidebarCollapsed`): a slim rail with just
/// the expand toggle, not hidden entirely, so it's always one click away.
export function RightSidebarFrame({
  actions,
  railActions = actions,
  dropLabel,
  children,
}: {
  /// Actions, laid out for this sidebar via `className`.
  actions: (className?: string) => React.ReactNode;
  /// What the slim rail shows instead of `actions` while the sidebar is collapsed: a page that
  /// lists its actions as labelled buttons in the open sidebar keeps them as icons here.
  railActions?: (className?: string) => React.ReactNode;
  /// What dropping a file from outside the app on this sidebar does, shown while one is dragged
  /// over it. Left out when the page takes no files.
  dropLabel?: string;
  children?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useRightSidebarCollapsed();
  const storedWidth = useNavStore((s) => s.rightSidebarWidth);
  const setStoredWidth = useNavStore((s) => s.setRightSidebarWidth);
  // Live width while dragging; persisted once on release instead of on every move.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const { over, dragProps } = useFileDragOver();

  // Only fires in the focused group, so it toggles the sidebar on that side of a split.
  useAppHotkey("toggleDetailSidebar", () => setCollapsed(!collapsed));

  if (collapsed) {
    return (
      <div className="hidden w-15 shrink-0 flex-col items-center border-l border-border p-3 @3xl:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
            >
              <IconLayoutSidebarRightExpand size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <span className="flex items-center gap-2">
              Expand sidebar <ToggleShortcut />
            </span>
          </TooltipContent>
        </Tooltip>
        {railActions("mt-2 flex-col")}
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
      className="relative hidden w-(--right-sidebar-width) shrink-0 @3xl:flex"
      {...dragProps}
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
      <div className="relative flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto border-l border-border p-3 [&>*:not(:first-child)]:border-b [&>*:not(:first-child)]:border-border [&>*:not(:first-child)]:pb-5">
        <div className="flex items-center justify-between gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Collapse sidebar"
                onClick={() => setCollapsed(true)}
              >
                <IconLayoutSidebarRightCollapse size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <span className="flex items-center gap-2">
                Collapse sidebar <ToggleShortcut />
              </span>
            </TooltipContent>
          </Tooltip>
          {actions()}
        </div>
        {children}
      </div>
      {over && dropLabel && <FileDropOverlay label={dropLabel} className="inset-1.5" />}
    </div>
  );
}
