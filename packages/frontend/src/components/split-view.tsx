import { IconLayoutColumns } from "@tabler/icons-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { CrashFallback, ErrorBoundary } from "#/components/error-boundary.tsx";
import { TabBar, useTabGroups } from "#/components/tab-bar.tsx";
import { TabGroupContext, type TabGroupScope } from "#/components/tab-group-scope.ts";
import { dashboardCornerSlot } from "#/features/dashboard/DashboardMascotCorner.tsx";
import { useTabScroll } from "#/hooks/use-tab-scroll.ts";
import { useDropTarget } from "#/lib/use-drop-target.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import {
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  type TabGroup,
  activeTab,
  clampSplitRatio,
} from "#/lib/store/tab-groups.ts";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// The narrowest a group gets. Below twice this, the split collapses to the focused
/// group instead of cramming both in.
export const MIN_GROUP_WIDTH = 360;
/// The gap the divider sits in, between the two groups: its `w-3`.
const DIVIDER_WIDTH = 12;
const KEYBOARD_STEP = 0.02;

export function fitsSplit(width: number): boolean {
  return width >= MIN_GROUP_WIDTH * 2 + DIVIDER_WIDTH;
}

/// Whether the content area is wide enough to show both groups. Set by `SplitView`,
/// read by the shell to decide where the focused group's tabs go.
export const useSplitFits = create<{ fits: boolean }>(() => ({ fits: true }));

/// Whether both groups are on screen side by side.
export function useSplitShown(): boolean {
  const twoGroups = useNavStore((s) => s.groups.length > 1);
  const fits = useSplitFits((s) => s.fits);
  const zoomed = useNavStore((s) => s.groupZoomed);
  return twoGroups && fits && !zoomed;
}

/// Views drawing their own edge to edge chrome, like the Linear style Tasks page.
const BLEED_MODULES = new Set([
  "tasks",
  "sessions",
  "calendar",
  "assignments",
  "exams",
  "decks",
  "files",
  "bookmarks",
]);

function isBleedView(view: View): boolean {
  return (
    view.kind === "entity" ||
    view.kind === "calendar" ||
    view.kind === "tasks" ||
    view.kind === "assignments" ||
    (view.kind === "module" && BLEED_MODULES.has(view.module))
  );
}

/// Keeps the ratio where both groups stay at least `MIN_GROUP_WIDTH` wide.
function fitRatio(ratio: number, width: number | null): number {
  const clamped = clampSplitRatio(ratio);
  if (!width) return clamped;
  const min = Math.max(MIN_SPLIT_RATIO, MIN_GROUP_WIDTH / width);
  const max = Math.min(MAX_SPLIT_RATIO, 1 - MIN_GROUP_WIDTH / width);
  return min > max ? DEFAULT_SPLIT_RATIO : Math.min(max, Math.max(min, clamped));
}

function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/// The page area: one tab group, or two side by side with a divider between them.
/// `renderGroup` draws a group's active view; it reads the group through
/// `useTabGroupScope`.
export function SplitView({ renderGroup }: { renderGroup: (scope: TabGroupScope) => ReactNode }) {
  const groups = useTabGroups();
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const zoomed = useNavStore((s) => s.groupZoomed);
  const storedRatio = useNavStore((s) => s.splitRatio);
  const draggingTabId = useNavStore((s) => s.draggingTabId);
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useWidth(containerRef);
  const fits = width === null || fitsSplit(width);
  useEffect(() => useSplitFits.setState({ fits }), [fits]);
  // Live while the divider is dragged; saved once on release.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratio = fitRatio(dragRatio ?? storedRatio, width);

  const split = groups.length > 1 && fits && !zoomed;
  const shown = split ? groups : groups.filter((g) => g.id === focusedGroupId);
  const source = draggingTabId
    ? groups.find((g) => g.tabs.some((t) => t.id === draggingTabId))
    : undefined;

  const items: ReactNode[] = [];
  shown.forEach((group, index) => {
    if (index === 1) {
      items.push(
        <SplitDivider
          key="divider"
          ratio={ratio}
          containerRef={containerRef}
          width={width}
          onDrag={setDragRatio}
        />,
      );
    }
    items.push(
      <GroupPane
        key={group.id}
        group={group}
        position={split ? (index === 0 ? "left" : "right") : "only"}
        focused={group.id === focusedGroupId}
        ratio={ratio}
        renderGroup={renderGroup}
        acceptsDrop={split && source !== undefined && source.id !== group.id}
      />,
    );
  });

  return (
    <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1">
      {items}
      {!split && groups.length === 1 && source && source.tabs.length > 1 && <NewGroupDropZone />}
    </div>
  );
}

function GroupPane({
  group,
  position,
  focused,
  ratio,
  renderGroup,
  acceptsDrop,
}: {
  group: TabGroup;
  position: "only" | "left" | "right";
  focused: boolean;
  ratio: number;
  renderGroup: (scope: TabGroupScope) => ReactNode;
  acceptsDrop: boolean;
}) {
  const tab = activeTab(group);
  const scope = useMemo(
    () => ({ groupId: group.id, tabId: tab.id, view: tab.view, focused }),
    [group.id, tab.id, tab.view, focused],
  );
  const split = position !== "only";
  const focus = () => useNavStore.getState().focusGroup(group.id);
  const Landmark = split ? "section" : "div";

  return (
    <Landmark
      aria-label={split ? (position === "left" ? "Left Group" : "Right Group") : undefined}
      data-tab-group={group.id}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
      className={cn(
        "flex min-h-0 min-w-0 flex-col",
        // Half the divider's `w-3` comes off the left group's share.
        position === "left" ? "w-[calc(var(--group-share)-6px)] shrink-0" : "flex-1",
      )}
      // SAFETY: `--group-share` only ever receives a clamped fraction as a percentage.
      style={
        position === "left" ? ({ "--group-share": `${ratio * 100}%` } as CSSProperties) : undefined
      }
    >
      {split && (
        <TabBar
          groupId={group.id}
          label={position === "left" ? "Left Group Tabs" : "Right Group Tabs"}
          className="h-8 border-b-0 bg-transparent px-0 pb-1 group-has-[[data-slot=sidebar][data-state=collapsed]]/app:h-9 group-has-[[data-slot=sidebar][data-state=collapsed]]/app:pt-1"
        />
      )}
      <TabGroupContext.Provider value={scope}>
        <PaneBody scope={scope} highlighted={focused && split} renderGroup={renderGroup} />
      </TabGroupContext.Provider>
      {acceptsDrop && <GroupDropZone groupId={group.id} />}
    </Landmark>
  );
}

/// A group's page card. Rendered inside the group's scope, so the scroll it
/// remembers is this group's tab's.
function PaneBody({
  scope,
  highlighted,
  renderGroup,
}: {
  scope: TabGroupScope;
  /// The focused group of a split shows a subtly tinted border.
  highlighted: boolean;
  renderGroup: (scope: TabGroupScope) => ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  useTabScroll(pageRef, "page");
  const { view, groupId } = scope;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* `isolate` keeps the page's own z-indexes (a calendar's sticky header and now line) below the corner slot. */}
      <div
        data-focused-group={highlighted || undefined}
        className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sidebar-border bg-card shadow-md transition-colors data-focused-group:border-primary/35 group-has-[[data-slot=sidebar][data-state=collapsed]]/app:rounded-none group-has-[[data-slot=sidebar][data-state=collapsed]]/app:border-0 group-has-[[data-slot=sidebar][data-state=collapsed]]/app:shadow-none"
      >
        <div
          ref={pageRef}
          className={cn(
            "@container min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
            !isBleedView(view) && "p-6",
          )}
        >
          <ErrorBoundary
            // A view that crashes is dropped when the user navigates elsewhere.
            resetKeys={[view]}
            fallback={(reset) => <CrashFallback reset={reset} what="this view" />}
          >
            {renderGroup(scope)}
          </ErrorBoundary>
        </div>
      </div>
      {/* The Dashboard draws its mascot cutout here, above the page's own border. */}
      <div
        id={dashboardCornerSlot(groupId)}
        className="pointer-events-none absolute top-px right-px z-10 size-0"
      />
    </div>
  );
}

/// The handle between the groups: drag it, or focus it and use the arrow keys, Home
/// and End. A double click splits evenly again.
function SplitDivider({
  ratio,
  containerRef,
  width,
  onDrag,
}: {
  ratio: number;
  containerRef: RefObject<HTMLDivElement | null>;
  width: number | null;
  onDrag: (ratio: number | null) => void;
}) {
  const save = (next: number) => useNavStore.getState().setSplitRatio(fitRatio(next, width));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const box = container.getBoundingClientRect();
    let latest = ratio;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (move: PointerEvent) => {
      latest = fitRatio((move.clientX - box.left) / box.width, box.width);
      onDrag(latest);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      save(latest);
      onDrag(null);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      // A focusable splitter is the WAI-ARIA window splitter pattern; `<hr>` can't be interactive.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Groups"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={MIN_SPLIT_RATIO * 100}
      aria-valuemax={MAX_SPLIT_RATIO * 100}
      tabIndex={0}
      title="Drag to resize, double click to split evenly"
      onPointerDown={onPointerDown}
      onDoubleClick={() => save(DEFAULT_SPLIT_RATIO)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") save(ratio - KEYBOARD_STEP);
        else if (event.key === "ArrowRight") save(ratio + KEYBOARD_STEP);
        else if (event.key === "Home") save(MIN_SPLIT_RATIO);
        else if (event.key === "End") save(MAX_SPLIT_RATIO);
        else return;
        event.preventDefault();
      }}
      className="relative w-3 shrink-0 cursor-col-resize outline-none before:absolute before:inset-y-2 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent before:transition-colors group-has-[[data-slot=sidebar][data-state=collapsed]]/app:before:inset-y-0 group-has-[[data-slot=sidebar][data-state=collapsed]]/app:before:bg-border hover:before:w-1 hover:before:bg-primary/50 focus-visible:before:w-1 focus-visible:before:bg-primary/50 active:before:bg-primary"
    />
  );
}

/// While a tab is dragged with one group open, the right edge of the page takes it
/// into a new group on the right. The preview shows where that group will sit.
function NewGroupDropZone() {
  const { dragOver, dropProps } = useDropTarget(() => {
    const state = useNavStore.getState();
    if (state.draggingTabId) state.moveTabToGroup(state.draggingTabId, "new-right");
    state.setDraggingTabId(null);
  });
  return (
    <>
      <div aria-hidden className="absolute inset-y-0 right-0 z-30 w-1/4" {...dropProps} />
      {dragOver && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-1/2 rounded-xl border-2 border-dashed border-primary/60 bg-primary/10"
        />
      )}
    </>
  );
}

/// While a tab of the other group is dragged, this group's page takes it.
function GroupDropZone({ groupId }: { groupId: string }) {
  const { dragOver, dropProps } = useDropTarget(() => {
    const state = useNavStore.getState();
    if (state.draggingTabId) state.moveTabToGroup(state.draggingTabId, { groupId });
    state.setDraggingTabId(null);
  });
  return (
    <div
      aria-hidden
      {...dropProps}
      className={cn(
        "absolute inset-x-0 top-8 bottom-0 z-30 rounded-xl group-has-[[data-slot=sidebar][data-state=collapsed]]/app:top-9 border-2 border-dashed transition-colors",
        dragOver ? "border-primary/60 bg-primary/10" : "border-transparent",
      )}
    />
  );
}

/// With two groups but no room for both, the focused group's tab bar offers to switch.
export function OtherGroupButton() {
  const groups = useNavStore((s) => s.groups);
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const other = groups.find((g) => g.id !== focusedGroupId);
  if (!other) return null;
  const label = groups[0].id === other.id ? "Show Left Group" : "Show Right Group";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={label}
          className="ml-auto shrink-0"
          onClick={() => useNavStore.getState().focusGroup(other.id)}
        >
          <IconLayoutColumns />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
