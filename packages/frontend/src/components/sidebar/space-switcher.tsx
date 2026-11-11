import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { IconDots, IconFolderPlus, IconLayoutGridAdd, IconPlus } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AddModulePicker } from "#/components/add-module-picker.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { reorderSpaces } from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { moveSpaceId, spaceRow } from "#/lib/space-row.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { SpaceDialog } from "./space-dialogs";
import { SpaceIcon } from "./space-icon";
import { useSpaceModules } from "./use-space-modules";
import { SpaceName } from "#/components/sidebar/space-name.tsx";

/// Spaces reorder across the row and the overflow as one list, and nothing shifts live
/// while dragging: the drop target is highlighted and the order changes on release.
const noShift = () => null;

/// Over the Space under the pointer when there is one, else the nearest one.
const collide: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

interface SlotActions {
  onActivate: (space: Space) => void;
  onOpenDialog: (dialog: SpaceDialog) => void;
}

/// The row of Space icons: up to four slots, the last one an overflow button when there are
/// more Spaces than that. Right click an icon for its menu, drag to reorder.
export function SpaceSwitcher({
  spaces,
  activeSpace,
  onActivate,
  onOpenDialog,
}: { spaces: Space[]; activeSpace: Space | null } & SlotActions) {
  const queryClient = useQueryClient();
  const { visible, overflow, displaced } = spaceRow(spaces, activeSpace?.id ?? null);
  const [dragging, setDragging] = useState<Space | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const reorder = useMutation({
    mutationFn: reorderSpaces,
    // Also puts the row back in the saved order when the reorder was refused.
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.spaces }),
  });

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over) return;
    const temporary = displaced && activeSpace ? activeSpace : null;
    const next = moveSpaceId(
      spaces.map((s) => s.id),
      String(active.id),
      String(over.id),
      temporary && displaced ? { temporaryId: temporary.id, displacedId: displaced.id } : null,
    );
    if (!next) return;
    const byId = new Map(spaces.map((s) => [s.id, s]));
    queryClient.setQueryData<Space[]>(
      qk.spaces,
      next.flatMap((id) => byId.get(id) ?? []),
    );
    reorder.mutate(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={(e) => setDragging(spaces.find((s) => s.id === e.active.id) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <SortableContext items={spaces.map((s) => s.id)} strategy={noShift}>
        <div className="flex items-center gap-0.5">
          {visible.map((space) => (
            <SpaceSlot
              key={space.id}
              space={space}
              active={space.id === activeSpace?.id}
              onActivate={onActivate}
              onOpenDialog={onOpenDialog}
            />
          ))}
          {overflow.length > 0 && (
            <SpaceOverflow spaces={overflow} onActivate={onActivate} onOpenDialog={onOpenDialog} />
          )}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="flex size-7 items-center justify-center rounded-md border bg-sidebar shadow-md">
            <SpaceIcon space={dragging} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function useSpaceSortable(space: Space) {
  const sortable = useSortable({ id: space.id });
  return {
    ...sortable,
    // The icon is the drag handle, so the pointer sensor gets a click through its 4px threshold.
    handleProps: { ...sortable.attributes, ...sortable.listeners },
  };
}

function SpaceSlot({
  space,
  active,
  onActivate,
  onOpenDialog,
}: { space: Space; active: boolean } & SlotActions) {
  const { setNodeRef, isDragging, isOver, handleProps } = useSpaceSortable(space);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          ref={setNodeRef}
          aria-label={space.name}
          onClick={() => onActivate(space)}
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2",
            // The foreground color: light in dark mode, dark in light mode, and see through so the
            // Space's own color still shows.
            active && "bg-sidebar-foreground/20",
            isDragging && "opacity-40",
            isOver && !isDragging && "ring-2 ring-sidebar-ring",
          )}
          {...handleProps}
          // After the handle props, which carry their own (always false) `aria-pressed`.
          aria-pressed={active}
          {...slotContext(space, onOpenDialog)}
        >
          <SpaceIcon space={space} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{space.name}</TooltipContent>
    </Tooltip>
  );
}

/// The right click menu of a Space's icon. Rename, Change icon and Change color all open
/// the Space's settings, where name, icon and color sit together.
function slotContext(space: Space, onOpenDialog: (dialog: SpaceDialog) => void) {
  return contextTarget("space", {
    space,
    openSettings: () => onOpenDialog({ kind: "settings", space }),
    openLabels: () => onOpenDialog({ kind: "labels", space }),
    openDelete: () => onOpenDialog({ kind: "delete", space }),
  });
}

/// The three dot button of the last slot, listing the Spaces that did not fit.
function SpaceOverflow({ spaces, onActivate, onOpenDialog }: { spaces: Space[] } & SlotActions) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More Spaces"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 data-[state=open]:bg-sidebar-accent"
            >
              <IconDots className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">More Spaces</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-52 p-1" aria-label="More Spaces">
        <ul className="flex flex-col gap-0.5">
          {spaces.map((space) => (
            <OverflowRow
              key={space.id}
              space={space}
              onActivate={(s) => {
                onActivate(s);
                setOpen(false);
              }}
              onOpenDialog={(dialog) => {
                onOpenDialog(dialog);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function OverflowRow({ space, onActivate, onOpenDialog }: { space: Space } & SlotActions) {
  const { setNodeRef, isDragging, isOver, handleProps } = useSpaceSortable(space);
  return (
    <li ref={setNodeRef}>
      <button
        type="button"
        onClick={() => onActivate(space)}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm ring-ring outline-hidden hover:bg-accent focus-visible:ring-2",
          isDragging && "opacity-40",
          isOver && !isDragging && "ring-2",
        )}
        {...handleProps}
        {...slotContext(space, onOpenDialog)}
      >
        <SpaceIcon space={space} />
        <SpaceName space={space} />
      </button>
    </li>
  );
}

/// The "+" on the left of the row: a new Space, or a module for the Space shown.
export function SidebarAddMenu({
  space,
  onNewSpace,
}: {
  space: Space | null;
  onNewSpace: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const { unusedKeys, addModule } = useSpaceModules(space);
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicking(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Add">
              <IconPlus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">New Space or Module</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        className={cn(picking ? "w-80 p-0" : "w-48 p-1")}
        aria-label="Add"
      >
        {picking ? (
          <AddModulePicker
            moduleKeys={unusedKeys}
            onSelect={(key) => addModule.mutateAsync(key)}
            onAdded={close}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            <MenuButton
              icon={<IconFolderPlus />}
              label="New Space"
              onClick={() => {
                close();
                onNewSpace();
              }}
            />
            <MenuButton
              icon={<IconLayoutGridAdd />}
              label="Add Module"
              disabled={!space}
              onClick={() => setPicking(true)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-hidden hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:text-muted-foreground"
    >
      {icon}
      {label}
    </button>
  );
}
