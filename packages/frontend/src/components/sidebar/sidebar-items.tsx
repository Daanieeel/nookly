import {
  IconCalendarWeek,
  IconChecklist,
  IconClipboardCheck,
  IconEye,
  IconEyeOff,
  IconFeather,
  IconLayoutDashboard,
  IconPin,
  IconSettings,
  IconTrash,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { SortableToggleList } from "#/components/sortable-toggle-list.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { SidebarMenuButton, SidebarMenuItem } from "@nookly/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { ASSIGNMENTS_OVERVIEW, TASKS_OVERVIEW } from "#/lib/api/views.ts";
import {
  type SidebarFixedId,
  type SidebarItemId,
  useSidebarHidden,
  useSidebarItems,
} from "#/lib/sidebar-items.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import { AssignmentsOverviewMeta } from "./module-row-meta";
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
            meta={target.kind === "assignments" ? <AssignmentsOverviewMeta /> : undefined}
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

/// The Trash icon in the bottom row, unless the user hid it. It stays reachable from the
/// command palette and the quick switcher.
export function SidebarTrashButton() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  const hidden = useSidebarHidden((s) => s.hidden.includes("trash"));
  if (hidden) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={view.kind === "trash" ? "secondary" : "ghost"}
          size="iconSm"
          aria-label="Trash"
          aria-current={view.kind === "trash" ? "page" : undefined}
          onClick={() => setView({ kind: "trash" })}
        >
          <IconTrash />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">Trash</TooltipContent>
    </Tooltip>
  );
}

/// A small settings button under the mascot. Its popover lists every cross-Space
/// item with an eye to show or hide it and a handle to move it.
export function SidebarCustomizeButton() {
  const items = useSidebarItems((s) => s.items);
  const setItems = useSidebarItems((s) => s.setItems);
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
        <PopoverContent align="end" className="w-56 p-1.5" aria-label="Customize sidebar">
          <SortableToggleList
            items={items}
            onChange={setItems}
            describe={(item) => ITEMS[item.id]}
          />
          <ul className="mt-1 flex flex-col gap-0.5 border-t border-border pt-1">
            <FixedRow id="trash" label="Trash" icon={IconTrash} />
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/// An entry at a fixed place in the sidebar: it can be shown or hidden but not moved.
function FixedRow({
  id,
  label,
  icon: Icon,
}: {
  id: SidebarFixedId;
  label: string;
  icon: TablerIcon;
}) {
  const hidden = useSidebarHidden((s) => s.hidden.includes(id));
  const toggle = useSidebarHidden((s) => s.toggle);
  const toggleLabel = `${hidden ? "Show" : "Hide"} ${label}`;
  return (
    <li className="flex h-8 items-center gap-1.5 rounded-md bg-popover pr-1 pl-2 text-sm">
      <Icon size={15} className={cn("shrink-0", hidden && "text-muted-foreground")} />
      <span className={cn("min-w-0 flex-1 truncate", hidden && "text-muted-foreground")}>
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={toggleLabel} onClick={() => toggle(id)}>
            {hidden ? <IconEyeOff /> : <IconEye />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{toggleLabel}</TooltipContent>
      </Tooltip>
    </li>
  );
}
