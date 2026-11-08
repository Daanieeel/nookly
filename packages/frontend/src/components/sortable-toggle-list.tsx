import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconEye,
  IconEyeOff,
  IconGripVertical,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// A list the user reorders by its handles and shows or hides entries of with an eye, like
/// the sidebar's items or a page's sections in their Customize popovers.

interface ToggleEntry {
  id: string;
  hidden: boolean;
}

export function SortableToggleList<T extends ToggleEntry>({
  items,
  onChange,
  describe,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  describe: (item: T) => { label: string; icon: TablerIcon };
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from !== -1 && to !== -1) onChange(arrayMove(items, from, to));
  }
  const toggle = (id: string) =>
    onChange(items.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item)));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <ToggleRow
              key={item.id}
              id={item.id}
              hidden={item.hidden}
              {...describe(item)}
              onToggle={() => toggle(item.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function ToggleRow({
  id,
  hidden,
  label,
  icon: Icon,
  onToggle,
}: ToggleEntry & { label: string; icon: TablerIcon; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const toggleLabel = `${hidden ? "Show" : "Hide"} ${label}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md bg-popover pr-1 pl-0.5 text-sm",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        type="button"
        aria-label={`Move ${label}`}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={14} />
      </button>
      <Icon size={15} className={cn("shrink-0", hidden && "text-muted-foreground")} />
      <span className={cn("min-w-0 flex-1 truncate", hidden && "text-muted-foreground")}>
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={toggleLabel} onClick={onToggle}>
            {hidden ? <IconEyeOff /> : <IconEye />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{toggleLabel}</TooltipContent>
      </Tooltip>
    </li>
  );
}
