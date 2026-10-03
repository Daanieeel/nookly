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
  IconCalendarWeek,
  IconChecklist,
  IconClipboardCheck,
  IconEye,
  IconEyeOff,
  IconFeather,
  IconGripVertical,
  IconLayoutDashboard,
  IconPin,
  IconSettings,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { SidebarMenuButton, SidebarMenuItem } from "@nookly/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { ASSIGNMENTS_OVERVIEW, TASKS_OVERVIEW } from "#/lib/api/views.ts";
import { type SidebarItemId, type SidebarItemPref, useSidebarItems } from "#/lib/sidebar-items.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import { OverviewNavItem } from "./overview-nav-item";
import { QuickJotTrigger } from "./quick-jot-trigger";

interface NavItemDef {
  label: string;
  icon: TablerIcon;
  /// The view the row opens; unset for an action like Quick Jot.
  view?: View;
}

const ITEMS = {
  dashboard: { label: "Dashboard", icon: IconLayoutDashboard, view: { kind: "dashboard" } },
  calendar: { label: "Calendar", icon: IconCalendarWeek, view: { kind: "calendar" } },
  tasks: { label: "Tasks", icon: IconChecklist, view: { kind: "tasks" } },
  assignments: { label: "Assignments", icon: IconClipboardCheck, view: { kind: "assignments" } },
  pinned: { label: "Pinned", icon: IconPin, view: { kind: "pinned" } },
  "quick-jot": { label: "Quick Jot", icon: IconFeather },
} satisfies Record<SidebarItemId, NavItemDef>;

/// The cross-Space rows under the mascot, in the user's order, minus the hidden ones.
export function SidebarNavItems() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  const items = useSidebarItems((s) => s.items);

  return items
    .filter((item) => !item.hidden)
    .map(({ id }) => {
      const { label, icon: Icon, view: target }: NavItemDef = ITEMS[id];
      if (!target) return <QuickJotTrigger key={id} />;
      if (target.kind === "tasks" || target.kind === "assignments") {
        return (
          <OverviewNavItem
            key={id}
            label={label}
            icon={Icon}
            target={target}
            module={target.kind === "tasks" ? TASKS_OVERVIEW : ASSIGNMENTS_OVERVIEW}
          />
        );
      }
      return (
        <SidebarMenuItem key={id}>
          <SidebarMenuButton
            size="sm"
            tooltip={label}
            isActive={view.kind === target.kind && !("viewId" in view && view.viewId)}
            onClick={() => setView(target)}
          >
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
}

/// A small settings button under the mascot. Its popover lists every cross-Space
/// item with an eye to show or hide it and a handle to move it.
export function SidebarCustomizeButton() {
  const items = useSidebarItems((s) => s.items);
  const setItems = useSidebarItems((s) => s.setItems);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from !== -1 && to !== -1) setItems(arrayMove(items, from, to));
  }
  const toggle = (id: SidebarItemId) =>
    setItems(items.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item)));

  return (
    <div className="flex justify-end">
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Customize sidebar">
                <IconSettings />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Customize sidebar</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-56 p-1.5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <CustomizeRow key={item.id} item={item} onToggle={() => toggle(item.id)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CustomizeRow({ item, onToggle }: { item: SidebarItemPref; onToggle: () => void }) {
  const { label, icon: Icon } = ITEMS[item.id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const toggleLabel = `${item.hidden ? "Show" : "Hide"} ${label}`;

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
      <Icon size={15} className={cn("shrink-0", item.hidden && "text-muted-foreground")} />
      <span className={cn("min-w-0 flex-1 truncate", item.hidden && "text-muted-foreground")}>
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={toggleLabel} onClick={onToggle}>
            {item.hidden ? <IconEyeOff /> : <IconEye />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{toggleLabel}</TooltipContent>
      </Tooltip>
    </li>
  );
}
