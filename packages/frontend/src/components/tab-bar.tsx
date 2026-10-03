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
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { SpaceDot } from "#/components/space-chip.tsx";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { getView } from "#/lib/api/views.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { HOTKEYS } from "#/lib/hotkeys.ts";
import { MODULE_ICONS, MODULE_LABELS } from "#/lib/modules.ts";
import { qk } from "#/lib/query-keys.ts";
import { type View, armNewTabIntent, currentTabs, useNavStore } from "#/lib/store/nav.ts";
import type { Tab } from "#/lib/store/tab-model.ts";
import { Button } from "@nookly/ui/components/button";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
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
  active,
  index,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  tab: Tab;
  active: boolean;
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { icon, label, spaceId } = useTabLabel(tab.view);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const space = spaceId ? spaces.find((s) => s.id === spaceId) : undefined;
  const [dragOver, setDragOver] = useState(false);

  const content = (
    <div
      data-tab
      role="tab"
      tabIndex={0}
      aria-selected={active}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dragged = useNavStore.getState().draggingTabId;
        if (dragged) useNavStore.getState().reorderTab(dragged, index);
      }}
      onClick={() => useNavStore.getState().switchTab(tab.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") useNavStore.getState().switchTab(tab.id);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          useNavStore.getState().closeTab(tab.id);
        }
      }}
      {...contextTarget("tab", { tabId: tab.id })}
      className={cn(
        "group/tab flex h-7 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors select-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        tab.pinned ? "justify-center px-1.5" : "max-w-48",
        active
          ? "border-input bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        dragging && "opacity-40",
        dragOver && "border-primary",
      )}
    >
      {space && <SpaceDot space={space} />}
      {icon}
      {!tab.pinned && (
        <>
          <span className="truncate">{label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Close Tab"
                onClick={(e) => {
                  e.stopPropagation();
                  useNavStore.getState().closeTab(tab.id);
                }}
                className="-mr-1 flex size-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground group-hover/tab:opacity-100 focus-visible:opacity-100"
              >
                <IconX size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Close Tab</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );

  // A pinned tab shows only its icon, so its name moves to a tooltip.
  return tab.pinned ? (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ) : (
    content
  );
}

/// Shortcuts for tabs, and Cmd or middle click on anything that navigates to open it
/// in a new tab instead.
export function useTabInteractions() {
  const { newTab, closeTab, closeOthers, cycle } = useMemo(
    () => ({
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
  useAppHotkey(HOTKEYS.newTab, newTab);
  useAppHotkey(HOTKEYS.closeTab, closeTab);
  useAppHotkey(HOTKEYS.closeOtherTabs, closeOthers);
  useAppHotkey(HOTKEYS.nextTab, () => cycle(1));
  useAppHotkey(HOTKEYS.previousTab, () => cycle(-1));
  useAppHotkey(HOTKEYS.nextTabAlt, () => cycle(1));
  useAppHotkey(HOTKEYS.previousTabAlt, () => cycle(-1));

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

/// The open tabs, in a slim row under the titlebar. Shown only while more than one is open.
export function TabBar() {
  const tabs = useNavStore((s) => s.tabs);
  const activeTabId = useNavStore((s) => s.activeTabId);
  const view = useNavStore((s) => s.view);
  const backStack = useNavStore((s) => s.backStack);
  const forwardStack = useNavStore((s) => s.forwardStack);
  const draggingTabId = useNavStore((s) => s.draggingTabId);
  const shown = useMemo(
    () => currentTabs({ tabs, activeTabId, view, backStack, forwardStack }),
    [tabs, activeTabId, view, backStack, forwardStack],
  );

  return (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-background px-3"
    >
      {shown.map((tab, index) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          index={index}
          dragging={draggingTabId === tab.id}
          onDragStart={() => useNavStore.getState().setDraggingTabId(tab.id)}
          onDragEnd={() => useNavStore.getState().setDraggingTabId(null)}
        />
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="New Tab"
            className="shrink-0"
            onClick={() => useNavStore.getState().openInNewTab()}
          >
            <IconPlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          New Tab
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>T</Kbd>
          </KbdGroup>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
