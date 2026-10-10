import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronRight,
  IconChecklist,
  IconClipboardCheck,
  IconFolder,
  IconLayoutDashboard,
  IconPin,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEscapeBack } from "#/hooks/use-escape-back.ts";
import { isTyping } from "#/lib/is-typing.ts";
import { type CSSProperties, type ReactNode, useEffect } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon, renderIconValue } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { Button } from "@nookly/ui/components/button";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { useTaskParent } from "#/features/tasks/task-parent.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { getView } from "#/lib/api/views.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { MODULE_ICONS, MODULE_LABELS, moduleForEntityType } from "#/lib/modules.ts";
import { useIsFullscreen } from "#/lib/fullscreen.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { qk } from "#/lib/query-keys.ts";
import { useAppHotkey, useRawHotkey } from "#/hooks/use-app-hotkey.ts";

function Crumb({
  icon,
  label,
  entityKey,
  onClick,
}: {
  icon: ReactNode;
  /// Unset when the crumb is only an entity key.
  label?: string;
  /// An entity's `TSK-14` style key, shown ahead of any label.
  entityKey?: string;
  onClick?: () => void;
}) {
  const key = entityKey && <EntityKey entityKey={entityKey} className="text-foreground" />;
  if (onClick) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="min-w-0 shrink-0 gap-1.5 px-1.5 text-sm [&_svg]:size-3.5"
      >
        {icon}
        {key}
        {label && <span className="max-w-48 truncate">{label}</span>}
      </Button>
    );
  }
  return (
    <span
      className={cn(
        "flex min-w-0 shrink-0 select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-foreground",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
      )}
    >
      {icon}
      {key}
      {label && <span className="max-w-48 truncate">{label}</span>}
    </span>
  );
}

function Separator() {
  return <IconChevronRight className="size-3 shrink-0 text-muted-foreground/50" />;
}

/// The active Space's icon + name — a plain indicator, not a breadcrumb crumb:
/// there's no "Space home" view to navigate to, so it isn't clickable. Only
/// shown for Space-scoped views (module/entity); `view.spaceId` is used
/// directly rather than the possibly-stale global `activeSpaceId`.
function SpaceIndicator({ spaceId }: { spaceId: string }) {
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return null;

  return (
    <span className="flex min-w-0 shrink-0 select-none items-center gap-1.5 text-sm text-muted-foreground">
      <span
        className="flex shrink-0 items-center text-(--space-color)"
        // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
        // string — `CSSProperties` just doesn't model custom properties.
        style={{ "--space-color": space.color } as CSSProperties}
      >
        {space.icon ? renderIconValue(space.icon, 14) : <IconFolder size={14} />}
      </span>
      <span className="max-w-40 truncate">{space.name}</span>
    </span>
  );
}

function EntityCrumbs({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const setView = useNavStore((s) => s.setView);
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: entity } = useQuery({
    queryKey: qk.entity.byId(entityId),
    queryFn: () => getEntity(entityId),
  });
  // Tasks read by their ID alone, as in Linear, and a Sub-task sits under its
  // parent: Tasks › TSK-3 › TSK-7.
  const parent = useTaskParent(entity);

  const moduleKey = entity ? moduleForEntityType(entity.type) : undefined;
  const isTask = moduleKey === "tasks";
  const ModuleIcon = moduleKey ? MODULE_ICONS[moduleKey] : null;

  return (
    <>
      <SpaceIndicator spaceId={spaceId} />
      {moduleKey && ModuleIcon && (
        <>
          <Separator />
          <Crumb
            icon={<ModuleIcon />}
            label={MODULE_LABELS[moduleKey]}
            onClick={() => setView({ kind: "module", spaceId, module: moduleKey })}
          />
        </>
      )}
      {parent && (
        <>
          <Separator />
          <span className="contents" {...entityTarget(parent)}>
            <Crumb
              icon={<EntityIcon entity={parent} size={14} />}
              entityKey={parent.key}
              onClick={() => openEntity(parent.id, parent.spaceId)}
            />
          </span>
        </>
      )}
      {entity && (
        <>
          <Separator />
          <span className="contents" {...entityTarget(entity)}>
            <Crumb
              icon={<EntityIcon entity={entity} size={14} />}
              entityKey={isTask ? entity.key : undefined}
              label={isTask ? undefined : displayTitle(entity)}
            />
          </span>
        </>
      )}
    </>
  );
}

/// A saved View's icon and name, the last crumb on its page.
function SavedViewCrumb({ viewId }: { viewId: string }) {
  const { data: view } = useQuery({
    queryKey: qk.views.byId(viewId),
    queryFn: () => getView(viewId),
  });
  if (!view) return null;
  return (
    <span className="contents" {...entityTarget(view.entity)}>
      <Crumb
        icon={<EntityIcon entity={view.entity} size={14} />}
        label={displayTitle(view.entity)}
      />
    </span>
  );
}

function SettingsButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="iconSm"
          className="ml-1 shrink-0"
          aria-label="Settings"
          onClick={() => useNavStore.getState().setSettingsOpen(true)}
        >
          <IconSettings size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        Settings
        <ShortcutKbd name="settings" />
      </TooltipContent>
    </Tooltip>
  );
}

function Breadcrumbs() {
  const view = useNavStore((s) => s.view);

  switch (view.kind) {
    case "dashboard":
      return <Crumb icon={<IconLayoutDashboard />} label="Dashboard" />;
    case "pinned":
      return <Crumb icon={<IconPin />} label="Pinned" />;
    case "tasks":
      return view.viewId ? (
        <>
          <Crumb
            icon={<IconChecklist />}
            label="Tasks"
            onClick={() => useNavStore.getState().setView({ kind: "tasks" })}
          />
          <Separator />
          <SavedViewCrumb viewId={view.viewId} />
        </>
      ) : (
        <Crumb icon={<IconChecklist />} label="Tasks" />
      );
    case "assignments":
      return view.viewId ? (
        <>
          <Crumb
            icon={<IconClipboardCheck />}
            label="Assignments"
            onClick={() => useNavStore.getState().setView({ kind: "assignments" })}
          />
          <Separator />
          <SavedViewCrumb viewId={view.viewId} />
        </>
      ) : (
        <Crumb icon={<IconClipboardCheck />} label="Assignments" />
      );
    case "trash":
      return <Crumb icon={<IconTrash />} label="Trash" />;
    case "module": {
      const Icon = MODULE_ICONS[view.module];
      return (
        <>
          <SpaceIndicator spaceId={view.spaceId} />
          <Separator />
          {view.viewId ? (
            <>
              <Crumb
                icon={<Icon />}
                label={MODULE_LABELS[view.module]}
                onClick={() =>
                  useNavStore
                    .getState()
                    .setView({ kind: "module", spaceId: view.spaceId, module: view.module })
                }
              />
              <Separator />
              <SavedViewCrumb viewId={view.viewId} />
            </>
          ) : (
            <Crumb icon={<Icon />} label={MODULE_LABELS[view.module]} />
          )}
        </>
      );
    }
    case "entity":
      return <EntityCrumbs entityId={view.entityId} spaceId={view.spaceId} />;
  }
}

/// Browser style Back and Forward through the views visited this session. Also on
/// Cmd+[ and Cmd+] (or Cmd+Left and Cmd+Right outside text fields), and the mouse's side buttons.
function HistoryButtons() {
  const canGoBack = useNavStore((s) => s.backStack.length > 0);
  const canGoForward = useNavStore((s) => s.forwardStack.length > 0);

  useEscapeBack();
  useAppHotkey("back", () => useNavStore.getState().goBack());
  useAppHotkey("forward", () => useNavStore.getState().goForward());
  // Cmd+Arrow moves the caret to the line edge while typing, so it only navigates outside text fields.
  useRawHotkey("backArrow", (event) => {
    if (isTyping()) return;
    event.preventDefault();
    useNavStore.getState().goBack();
  });
  useRawHotkey("forwardArrow", (event) => {
    if (isTyping()) return;
    event.preventDefault();
    useNavStore.getState().goForward();
  });

  useEffect(() => {
    const { goBack, goForward } = useNavStore.getState();
    function onMouseUp(e: MouseEvent) {
      if (e.button === 3) goBack();
      if (e.button === 4) goForward();
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div className="flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Go Back"
            disabled={!canGoBack}
            onClick={() => useNavStore.getState().goBack()}
          >
            <IconArrowLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          Go Back
          <ShortcutKbd name="back" />
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Go Forward"
            disabled={!canGoForward}
            onClick={() => useNavStore.getState().goForward()}
          >
            <IconArrowRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          Go Forward
          <ShortcutKbd name="forward" />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function Titlebar() {
  const fullscreen = useIsFullscreen();
  return (
    <div
      data-tauri-drag-region
      className={cn(
        "flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-background pr-3",
        fullscreen ? "pl-3" : "pl-12",
      )}
    >
      <div className={cn("flex min-w-0 shrink-0 items-center gap-1.5", !fullscreen && "ml-10")}>
        <HistoryButtons />
        <Breadcrumbs />
      </div>
      <div data-tauri-drag-region className="min-w-0 flex-1" />
      {/* Flush together: each button's own padding is the spacing. */}
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useNavStore.getState().setCommandsOpen(true)}
          className="shrink-0 gap-1.5"
        >
          Commands
          <ShortcutKbd name="commands" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useNavStore.getState().setSwitcherOpen(true)}
          className="shrink-0 gap-1.5"
        >
          Quick open
          <ShortcutKbd name="quickSwitcher" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useNavStore.getState().setPaletteOpen(true)}
          className="shrink-0 gap-1.5"
        >
          <IconSearch size={14} />
          Search
          <ShortcutKbd name="search" />
        </Button>
        <SettingsButton />
      </div>
    </div>
  );
}
