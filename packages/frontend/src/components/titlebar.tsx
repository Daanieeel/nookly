import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendarUser,
  IconChevronRight,
  IconFolder,
  IconLayoutDashboard,
  IconPin,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon, renderIconValue } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { FileViewerThemeToggle } from "#/components/file-viewer-theme-toggle.tsx";
import { ThemeToggle } from "#/components/theme-toggle.tsx";
import { UpdateCard } from "#/components/update-card.tsx";
import { DateTimeSettings } from "#/components/datetime-settings.tsx";
// Aliased: this file has its own breadcrumb `Separator`.
import { Separator as UiSeparator } from "@nookly/ui/components/separator";
import { Button } from "@nookly/ui/components/button";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  CalendarConnectionsDialog,
  useExternalCalendarStatus,
} from "#/features/sessions/external-calendars/CalendarConnectionsDialog.tsx";
import { useTaskParent } from "#/features/tasks/task-parent.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { MODULE_ICONS, MODULE_LABELS, moduleForEntityType } from "#/lib/modules.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { APP_UPDATE_QUERY_KEY, checkForUpdate, useAppVersion } from "#/lib/updater.ts";
import { cn } from "@nookly/ui/lib/utils";

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
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
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
    queryKey: ["entity", entityId],
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

function SettingsPopover() {
  const [open, setOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="iconSm"
                className="ml-1 shrink-0"
                aria-label="Settings"
              >
                <IconSettings size={14} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="flex w-96 flex-col gap-3 p-3">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">File Viewer Theme</span>
            <FileViewerThemeToggle />
          </div>
          <UiSeparator />
          <DateTimeSettings />
          <UiSeparator />
          <CalendarConnectionsSetting
            onOpen={() => {
              setOpen(false);
              setConnectionsOpen(true);
            }}
          />
          <UiSeparator />
          <div className="flex flex-col gap-2">
            <VersionSection />
          </div>
        </PopoverContent>
      </Popover>
      <CalendarConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
    </>
  );
}

/// Entry to the read only external calendar overlay shown on Sessions.
function CalendarConnectionsSetting({ onOpen }: { onOpen: () => void }) {
  const { data: status } = useExternalCalendarStatus();
  const count = status?.connections.length ?? 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-muted-foreground">Calendars</span>
        <span className="text-sm">
          {count === 0 ? "Not connected" : count === 1 ? "1 connected" : `${count} connected`}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>
        <IconCalendarUser size={14} />
        Manage
      </Button>
    </div>
  );
}

function VersionSection() {
  const version = useAppVersion();
  const queryClient = useQueryClient();
  const checkUpdate = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery({
        queryKey: APP_UPDATE_QUERY_KEY,
        queryFn: checkForUpdate,
        staleTime: 0,
      }),
  });
  const status = useActionStatus(checkUpdate);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground">Version</span>
          <span className="text-sm tabular-nums">{version ? `v${version}` : ""}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => !checkUpdate.isPending && checkUpdate.mutate()}
        >
          <StatusButtonContent
            status={status}
            icon={<IconRefresh size={14} />}
            label="Check for updates"
            successLabel={checkUpdate.data ? "Update found" : "Up to date"}
            errorLabel="Couldn't check"
          />
        </Button>
      </div>
      <UpdateCard />
    </>
  );
}

function Breadcrumbs() {
  const view = useNavStore((s) => s.view);

  switch (view.kind) {
    case "dashboard":
      return <Crumb icon={<IconLayoutDashboard />} label="Dashboard" />;
    case "pinned":
      return <Crumb icon={<IconPin />} label="Pinned" />;
    case "trash":
      return <Crumb icon={<IconTrash />} label="Trash" />;
    case "module": {
      const Icon = MODULE_ICONS[view.module];
      return (
        <>
          <SpaceIndicator spaceId={view.spaceId} />
          <Separator />
          <Crumb icon={<Icon />} label={MODULE_LABELS[view.module]} />
        </>
      );
    }
    case "entity":
      return <EntityCrumbs entityId={view.entityId} spaceId={view.spaceId} />;
  }
}

/// Browser style Back and Forward through the views visited this session. Also on
/// Cmd+[ and Cmd+], and the mouse's side buttons.
function HistoryButtons() {
  const canGoBack = useNavStore((s) => s.backStack.length > 0);
  const canGoForward = useNavStore((s) => s.forwardStack.length > 0);

  useEffect(() => {
    const { goBack, goForward } = useNavStore.getState();
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      e.preventDefault();
      if (e.key === "[") goBack();
      else goForward();
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 3) goBack();
      if (e.button === 4) goForward();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
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
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>[</Kbd>
          </KbdGroup>
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
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>]</Kbd>
          </KbdGroup>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function Titlebar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-background pr-3 pl-12"
    >
      <div className="ml-10 flex min-w-0 shrink-0 items-center gap-1.5">
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
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useNavStore.getState().setSwitcherOpen(true)}
          className="shrink-0 gap-1.5"
        >
          Quick open
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useNavStore.getState().setPaletteOpen(true)}
          className="shrink-0 gap-1.5"
        >
          <IconSearch size={14} />
          Search
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        <SettingsPopover />
      </div>
    </div>
  );
}
