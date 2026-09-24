import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronRight,
  IconFolder,
  IconHistory,
  IconLayoutDashboard,
  IconPin,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useEffect } from "react";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityIcon } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
import { StatusButtonContent, useActionStatus } from "@/components/action-feedback";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpdateCard } from "@/components/update-card";
import { DateTimeSettings } from "@/components/datetime-settings";
// Aliased: this file has its own breadcrumb `Separator`.
import { Separator as UiSeparator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTaskParent } from "@/features/tasks/task-parent";
import { getEntity } from "@/lib/api/entities";
import { listSpaces } from "@/lib/api/spaces";
import { displayTitle } from "@/lib/entity-title";
import { MODULE_ICONS, MODULE_LABELS, moduleForEntityType } from "@/lib/modules";
import { useNavStore } from "@/lib/store/nav";
import { APP_UPDATE_QUERY_KEY, checkForUpdate, useAppVersion } from "@/lib/updater";
import { cn } from "@/lib/utils";

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
      {space.icon ? (
        <span className="text-sm leading-none">{space.icon}</span>
      ) : (
        <IconFolder
          size={14}
          className="shrink-0 text-(--space-color)"
          // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
          // string — `CSSProperties` just doesn't model custom properties.
          style={{ "--space-color": space.color } as CSSProperties}
        />
      )}
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
  return (
    <Popover>
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
        <UiSeparator />
        <DateTimeSettings />
        <UiSeparator />
        <div className="flex flex-col gap-2">
          <VersionSection />
        </div>
      </PopoverContent>
    </Popover>
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
      <UpdateCard className="max-w-64" />
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
    case "recents":
      return <Crumb icon={<IconHistory />} label="Recents" />;
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
