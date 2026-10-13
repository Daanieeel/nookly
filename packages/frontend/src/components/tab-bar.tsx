import { useDropTarget } from "#/lib/use-drop-target.ts";
import {
  IconCalendar,
  IconChecklist,
  IconClipboardCheck,
  IconLayoutDashboard,
  IconPin,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode, useEffect, useMemo } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { SpaceDot } from "#/components/space-chip.tsx";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { getView } from "#/lib/api/views.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { MODULE_ICONS, MODULE_LABELS } from "#/lib/modules.ts";
import { qk } from "#/lib/query-keys.ts";
import { type View, armNewTabIntent, tabGroups, useNavStore } from "#/lib/store/nav.ts";
import type { TabGroup } from "#/lib/store/tab-groups.ts";
import type { Tab } from "#/lib/store/tab-model.ts";
import { Button } from "@nookly/ui/components/button";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Separator } from "@nookly/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";

/// What a tab shows for its view: the space dot, the page's icon and its name.
interface TabLabel {
  icon: ReactNode;
  label: string;
  spaceId?: string;
}

function useTabLabel(view: View): TabLabel {
  const entityId = view.kind === "entity" ? view.entityId : undefined;
  const savedViewId = "viewId" in view ? view.viewId : undefined;
  const { data: entity } = useQuery({
    queryKey: qk.entity.byId(entityId),
    queryFn: () => getEntity(entityId ?? ""),
    enabled: entityId !== undefined,
  });
  const { data: savedView } = useQuery({
    queryKey: qk.views.byId(savedViewId ?? ""),
    queryFn: () => getView(savedViewId ?? ""),
    enabled: savedViewId !== undefined,
  });

  switch (view.kind) {
    case "dashboard":
      return { icon: <IconLayoutDashboard />, label: "Dashboard" };
    case "pinned":
      return { icon: <IconPin />, label: "Pinned" };
    case "calendar":
      return { icon: <IconCalendar />, label: "Calendar" };
    case "trash":
      return { icon: <IconTrash />, label: "Trash" };
    case "tasks":
      return {
        icon: savedView ? <EntityIcon entity={savedView.entity} /> : <IconChecklist />,
        label: savedView ? displayTitle(savedView.entity) : "Tasks",
      };
    case "assignments":
      return {
        icon: savedView ? <EntityIcon entity={savedView.entity} /> : <IconClipboardCheck />,
        label: savedView ? displayTitle(savedView.entity) : "Assignments",
      };
    case "module": {
      const Icon = MODULE_ICONS[view.module];
      return {
        icon: savedView ? <EntityIcon entity={savedView.entity} /> : <Icon />,
        label: savedView ? displayTitle(savedView.entity) : MODULE_LABELS[view.module],
        spaceId: view.spaceId,
      };
    }
    case "entity":
      return {
        icon: entity ? <EntityIcon entity={entity} /> : null,
        label: entity ? displayTitle(entity) : "Loading",
        spaceId: view.spaceId,
      };
  }
}

function TabItem({
  tab,
  groupId,
  active,
  groupFocused,
  index,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  tab: Tab;
  groupId: string;
  active: boolean;
  /// Whether this tab's group is the focused one; only there the active tab stands out fully.
  groupFocused: boolean;
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { icon, label, spaceId } = useTabLabel(tab.view);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const space = spaceId ? spaces.find((s) => s.id === spaceId) : undefined;
  const { dragOver, dropProps } = useDropTarget(() => {
    const state = useNavStore.getState();
    const dragged = state.draggingTabId;
    if (!dragged) return;
    const from = tabGroups(state).find((g) => g.tabs.some((t) => t.id === dragged));
    if (from?.id === groupId) state.reorderTab(dragged, index);
    else state.moveTabToGroup(dragged, { groupId }, index);
  });

  // The tab role sits on the inner element so the close button is its sibling, not
  // nested inside it; the outer one carries the look, the drag and the menu.
  const content = (
    <div
      data-tab
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...dropProps}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          useNavStore.getState().closeTab(tab.id);
        }
      }}
      {...contextTarget("tab", { tabId: tab.id })}
      className={cn(
        "group/tab flex h-7 cursor-pointer items-center rounded-md border text-xs transition-colors select-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        tab.pinned ? "shrink-0" : "relative min-w-24 flex-1 basis-0",
        active && groupFocused && "border-input bg-accent text-foreground",
        active && !groupFocused && "border-input/60 bg-accent/50 text-foreground/80",
        !active &&
          "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        dragging && "opacity-40",
        dragOver && "border-primary",
      )}
    >
      <div
        role="tab"
        tabIndex={0}
        aria-selected={active}
        onClick={() => useNavStore.getState().switchTab(tab.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") useNavStore.getState().switchTab(tab.id);
        }}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          tab.pinned ? "px-1.5" : "px-6",
        )}
      >
        {space && <SpaceDot space={space} />}
        {icon}
        {!tab.pinned && <span className="truncate">{label}</span>}
      </div>
      {!tab.pinned && (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Out of the focus order and the accessibility tree: the keyboard closes tabs
                with the shortcut or the tab's menu. */}
            <button
              type="button"
              aria-label="Close Tab"
              aria-hidden
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                useNavStore.getState().closeTab(tab.id);
              }}
              className="absolute top-1/2 right-1.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground group-hover/tab:opacity-100 focus-visible:opacity-100"
            >
              <IconX size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close Tab</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  // A pinned tab shows only its icon, so its name moves to a tooltip.
  return tab.pinned ? (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  ) : (
    content
  );
}

/// Shortcuts for tabs, and Cmd or middle click on anything that navigates to open it
/// in a new tab instead.
export function useTabInteractions() {
  const { newTab, closeTab, closeOthers, cycle, split, focusAt } = useMemo(
    () => ({
      split: () => useNavStore.getState().splitRight(),
      focusAt: (index: number) => useNavStore.getState().focusGroupAt(index),
      newTab: () => useNavStore.getState().openInNewTab(),
      closeTab: () => {
        const state = useNavStore.getState();
        state.closeTab(state.activeTabId);
      },
      closeOthers: () => useNavStore.getState().closeOtherTabs(),
      cycle: (step: 1 | -1) => useNavStore.getState().cycleTab(step),
    }),
    [],
  );
  useAppHotkey("newTab", newTab);
  useAppHotkey("closeTab", closeTab);
  useAppHotkey("closeOtherTabs", closeOthers);
  useAppHotkey("nextTab", () => cycle(1));
  useAppHotkey("previousTab", () => cycle(-1));
  useAppHotkey("nextTabAlt", () => cycle(1));
  useAppHotkey("previousTabAlt", () => cycle(-1));
  useAppHotkey("splitRight", split);
  useAppHotkey("focusLeftGroup", () => focusAt(0));
  useAppHotkey("focusRightGroup", () => focusAt(1));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if ((e.metaKey || e.ctrlKey) && e.button === 0) armNewTabIntent();
    }
    // A middle click doesn't fire `click`, so it replays as a Cmd click on whatever
    // navigates. Tabs close on middle click themselves.
    function onAuxClick(e: MouseEvent) {
      if (e.button !== 1 || !(e.target instanceof Element)) return;
      if (e.target.closest("[data-tab]")) return;
      const link = e.target.closest("button, a, [role=button], [role=menuitem], [role=link]");
      if (!link) return;
      e.preventDefault();
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
      );
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("auxclick", onAuxClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("auxclick", onAuxClick, true);
    };
  }, []);
}

/// Every group, kept up to date from the live state.
export function useTabGroups(): TabGroup[] {
  const groups = useNavStore((s) => s.groups);
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const tabs = useNavStore((s) => s.tabs);
  const activeTabId = useNavStore((s) => s.activeTabId);
  const view = useNavStore((s) => s.view);
  const backStack = useNavStore((s) => s.backStack);
  const forwardStack = useNavStore((s) => s.forwardStack);
  return useMemo(
    () => tabGroups({ groups, focusedGroupId, tabs, activeTabId, view, backStack, forwardStack }),
    [groups, focusedGroupId, tabs, activeTabId, view, backStack, forwardStack],
  );
}

/// One group's open tabs, in a slim row. With one group it sits under the titlebar and
/// shows only while more than one tab is open; split, each group has its own.
export function TabBar({
  groupId,
  label,
  className,
  trailing,
}: {
  groupId: string;
  label?: string;
  className?: string;
  /// Shown after the New Tab button.
  trailing?: ReactNode;
}) {
  const groups = useTabGroups();
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const draggingTabId = useNavStore((s) => s.draggingTabId);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const shown = group.tabs;

  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-background px-3",
        className,
      )}
    >
      <div role="tablist" aria-label={label} className="flex min-w-0 flex-1 items-center gap-1">
        {shown.map((tab, index) => (
          <Fragment key={tab.id}>
            {/* Pinned tabs sit first, so the first regular one follows the last pinned. */}
            {!tab.pinned && index > 0 && shown[index - 1].pinned && (
              <Separator orientation="vertical" className="mx-1 h-4 shrink-0" />
            )}
            <TabItem
              tab={tab}
              groupId={group.id}
              active={tab.id === group.activeTabId}
              groupFocused={group.id === focusedGroupId}
              index={index}
              dragging={draggingTabId === tab.id}
              onDragStart={() => useNavStore.getState().setDraggingTabId(tab.id)}
              onDragEnd={() => useNavStore.getState().setDraggingTabId(null)}
            />
          </Fragment>
        ))}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="New Tab"
            className="shrink-0"
            onClick={() => {
              useNavStore.getState().focusGroup(group.id);
              useNavStore.getState().openInNewTab();
            }}
          >
            <IconPlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          New Tab
          <ShortcutKbd name="newTab" />
        </TooltipContent>
      </Tooltip>
      {trailing}
    </div>
  );
}
