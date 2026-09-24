import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { IconCaretDownFilled, IconCaretRightFilled, IconPlus } from "@tabler/icons-react";
import { type ReactNode, useEffect, useState } from "react";
import type { ContextTargetProps } from "@/components/context-menu/registry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type ViewGroup, isCollapsed, moveRowFocus, toggleId } from "./grouping";

/// What a card needs to become the drag handle: spread onto its open button.
export interface CardDrag {
  ref: (element: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  isDragging: boolean;
  /// Cursor classes for the handle: a grab hand when the card can be dragged.
  cursorClass: string;
}

interface BoardProps<T> {
  /// The columns. With sub-groups, each sub-group becomes a swimlane.
  groups: ViewGroup<T>[];
  getKey: (item: T) => string;
  renderCard: (item: T, drag: CardDrag) => ReactNode;
  /// The card following the pointer while dragging.
  renderOverlay: (item: T) => ReactNode;
  draggable: boolean;
  onMove?: (item: T, columnId: string, laneId: string | null) => void;
  onCreateIn?: (group: ViewGroup<T>, lane: ViewGroup<T> | null) => (() => void) | undefined;
  createLabel?: (name: string) => string;
  /// A column's context menu target.
  columnProps?: (group: ViewGroup<T>) => ContextTargetProps | undefined;
}

/// Linear style board: one column per group with cards. With sub-grouping, a row
/// of column headers sits on top and every sub-group is a collapsible swimlane
/// holding one cell per column. Cards drag between cells when `draggable`.
export function GroupedBoard<T>(props: BoardProps<T>) {
  const { groups, renderOverlay, onMove } = props;
  const [active, setActive] = useState<T | null>(null);
  // A few pixels of travel before a drag starts, so a plain click still opens the card.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    setActive(null);
    const item: T | undefined = event.active.data.current?.item;
    const columnId: string | undefined = event.over?.data.current?.columnId;
    const laneId: string | null = event.over?.data.current?.laneId ?? null;
    if (item !== undefined && columnId !== undefined) onMove?.(item, columnId, laneId);
  }

  // The pointer sits over other elements mid drag, so the hand goes on the page.
  const dragging = active !== null;
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add("cursor-grabbing");
    return () => document.body.classList.remove("cursor-grabbing");
  }, [dragging]);

  const lanes = groups[0]?.subgroups;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => setActive(event.active.data.current?.item ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {lanes ? <LaneBoard {...props} lanes={lanes} /> : <ColumnBoard {...props} />}
      <DragOverlay dropAnimation={null}>{active !== null && renderOverlay(active)}</DragOverlay>
    </DndContext>
  );
}

/// Without sub-groups: full height columns, each scrolling on its own.
function ColumnBoard<T>(props: BoardProps<T>) {
  const { groups, onCreateIn, columnProps } = props;
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the card buttons inside
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3" onKeyDown={moveRowFocus}>
      {groups.map((group) => {
        const onCreate = onCreateIn?.(group, null);
        return (
          <Cell
            key={group.id}
            {...props}
            columnId={group.id}
            laneId={null}
            items={group.items}
            onCreate={onCreate}
            name={group.name}
            className="flex w-80 shrink-0 flex-col rounded-lg"
            extra={columnProps?.(group)}
            header={
              <ColumnHeader
                group={group}
                count={group.items.length}
                onCreate={onCreate}
                createLabel={props.createLabel}
              />
            }
            bodyClassName="min-h-0 flex-1 overflow-y-auto"
          />
        );
      })}
    </div>
  );
}

/// With sub-groups: shared column headers on top, then one swimlane per
/// sub-group that holds anything.
function LaneBoard<T>(props: BoardProps<T> & { lanes: ViewGroup<T>[] }) {
  const { groups, lanes, onCreateIn, columnProps } = props;
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const cell = (group: ViewGroup<T>, laneId: string) =>
    group.subgroups?.find((s) => s.id === laneId);
  const laneCount = (laneId: string) =>
    groups.reduce((sum, g) => sum + (cell(g, laneId)?.items.length ?? 0), 0);

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the card buttons inside
    <div className="min-h-0 flex-1 overflow-auto pb-3" onKeyDown={moveRowFocus}>
      <div className="flex w-max min-w-full flex-col">
        <div className="sticky top-0 z-20 flex gap-3 bg-card px-3 pt-3">
          {groups.map((group) => (
            <div key={group.id} className="w-80 shrink-0 rounded-lg bg-foreground/3">
              <ColumnHeader
                group={group}
                count={group.items.length}
                onCreate={onCreateIn?.(group, null)}
                createLabel={props.createLabel}
              />
            </div>
          ))}
        </div>
        {lanes
          .filter((lane) => laneCount(lane.id) > 0)
          .map((lane) => {
            const collapsed = isCollapsed(toggled, lane.id, lane.defaultCollapsed);
            return (
              <section key={lane.id} aria-label={lane.name} className="flex flex-col">
                <div className="sticky left-0 flex h-10 w-fit items-center px-3 pt-2">
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() => setToggled((prev) => toggleId(prev, lane.id))}
                    className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
                  >
                    {collapsed ? (
                      <IconCaretRightFilled size={10} className="text-muted-foreground" />
                    ) : (
                      <IconCaretDownFilled size={10} className="text-muted-foreground" />
                    )}
                    {lane.icon}
                    <span className="font-medium">{lane.name}</span>
                    <span className="text-muted-foreground tabular-nums">{laneCount(lane.id)}</span>
                  </button>
                </div>
                {!collapsed && (
                  <div className="flex gap-3 px-3">
                    {groups.map((group) => {
                      const sub = cell(group, lane.id);
                      return (
                        <Cell
                          key={group.id}
                          {...props}
                          columnId={group.id}
                          laneId={lane.id}
                          items={sub?.items ?? []}
                          onCreate={sub ? onCreateIn?.(group, sub) : undefined}
                          name={`${group.name}, ${lane.name}`}
                          className="w-80 shrink-0 rounded-lg"
                          extra={columnProps?.(group)}
                          bodyClassName="min-h-12 pt-2"
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}

function ColumnHeader<T>({
  group,
  count,
  onCreate,
  createLabel,
}: {
  group: ViewGroup<T>;
  count: number;
  onCreate: (() => void) | undefined;
  createLabel?: (name: string) => string;
}) {
  const label = createLabel?.(group.name) ?? `New in ${group.name}`;
  return (
    <header className="group/col flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
      {group.icon}
      <span className="truncate text-sm font-medium">{group.name}</span>
      <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
      {onCreate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onClick={onCreate}
              className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/col:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
            >
              <IconPlus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      )}
    </header>
  );
}

/// A drop target holding cards: a whole column, or one column of a swimlane.
function Cell<T>({
  columnId,
  laneId,
  items,
  name,
  header,
  className,
  bodyClassName,
  extra,
  onCreate,
  getKey,
  renderCard,
  draggable,
  createLabel,
}: BoardProps<T> & {
  columnId: string;
  laneId: string | null;
  items: T[];
  name: string;
  header?: ReactNode;
  className?: string;
  bodyClassName?: string;
  extra?: ContextTargetProps;
  onCreate: (() => void) | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${columnId}/${laneId ?? ""}`,
    data: { columnId, laneId },
    disabled: !draggable,
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={cn(
        "group/lane bg-foreground/3 transition-colors",
        isOver && "bg-foreground/6",
        className,
      )}
      {...extra}
    >
      {header}
      <div className={cn("flex flex-col gap-2 px-2 pb-2", bodyClassName)}>
        {items.map((item) => (
          <DraggableCard
            key={getKey(item)}
            item={item}
            id={`${getKey(item)}/${columnId}/${laneId ?? ""}`}
            draggable={draggable}
            renderCard={renderCard}
          />
        ))}
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            aria-label={createLabel?.(name) ?? `New in ${name}`}
            className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/lane:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100"
          >
            <IconPlus size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function DraggableCard<T>({
  item,
  id,
  draggable,
  renderCard,
}: {
  item: T;
  /// Unique per place, since an item can sit in several groups.
  id: string;
  draggable: boolean;
  renderCard: (item: T, drag: CardDrag) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { item },
    disabled: !draggable,
  });
  return renderCard(item, {
    ref: setNodeRef,
    listeners,
    attributes,
    isDragging,
    cursorClass: draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
  });
}
