import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { Button } from "@nookly/ui/components/button";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@nookly/ui/components/sidebar";
import { startNewPage } from "#/features/notes/new-page.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cycleSpaceId } from "#/lib/space-row.ts";
import { createSwipeTracker } from "#/lib/swipe-tracker.ts";
import { cn } from "@nookly/ui/lib/utils";
import { UpdateCard } from "#/components/update-card.tsx";
import { UpdatedCard } from "#/components/updated-card.tsx";
import { ActiveSpaceModules } from "./sidebar/active-space-modules";
import { CliInstallCard } from "./sidebar/cli-install-card";
import {
  SidebarCustomizeButton,
  SidebarNavItems,
  SidebarTrashButton,
} from "./sidebar/sidebar-items";
import { SidebarMascot } from "./sidebar/sidebar-mascot";
import { CreateSpaceDialog, type SpaceDialog, SpaceDialogs } from "./sidebar/space-dialogs";
import { SidebarAddMenu, SpaceSwitcher } from "./sidebar/space-switcher";
import { qk } from "#/lib/query-keys.ts";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";

/// Which way the list of modules slides in when the Space changes: from the right when
/// the new Space comes later in the stored order, from the left when it comes earlier.
/// Not at all on the first render.
function useSlideDirection(spaces: Space[], activeId: string | null): "next" | "previous" | null {
  const [state, setState] = useState<{
    activeId: string | null;
    direction: "next" | "previous" | null;
  }>({
    activeId,
    direction: null,
  });
  if (state.activeId !== activeId) {
    const ids = spaces.map((s) => s.id);
    const from = state.activeId === null ? -1 : ids.indexOf(state.activeId);
    const to = activeId === null ? -1 : ids.indexOf(activeId);
    setState({
      activeId,
      direction: from === -1 || to === -1 ? null : to > from ? "next" : "previous",
    });
  }
  return state.direction;
}

export function AppSidebar() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [dialog, setDialog] = useState<SpaceDialog | null>(null);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const setActiveSpace = useNavStore((s) => s.setActiveSpace);
  // The sidebar follows the focused tab, so this is the Space of the page being shown, or
  // the one picked in the row. A deleted or unknown one falls back to the first Space.
  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0] ?? null;
  const direction = useSlideDirection(spaces, activeSpace?.id ?? null);

  function stepSpace(step: 1 | -1, wrap: boolean) {
    const next = cycleSpaceId(
      spaces.map((s) => s.id),
      activeSpace?.id ?? null,
      step,
      wrap,
    );
    if (next && next !== activeSpace?.id) setActiveSpace(next);
  }
  useAppHotkey("previousSpace", () => stepSpace(-1, true));
  useAppHotkey("nextSpace", () => stepSpace(1, true));
  useAppHotkey("newPage", () => void startNewPage(queryClient));

  // Two fingers swiping sideways on the sidebar cycle through the Spaces.
  const swipe = useRef(createSwipeTracker());
  function onWheel(event: React.WheelEvent) {
    const step = swipe.current(event.deltaX, event.deltaY, event.timeStamp);
    if (step !== 0) stepSpace(step, false);
  }

  // Collapsed, the sidebar is gone and the page takes the whole window, like Arc or
  // Zen. Resting the pointer on the left edge slides it back over the page until the
  // pointer leaves it.
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  useAppHotkey("toggleSidebar", toggleSidebar);
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    if (!collapsed) setPeeking(false);
  }, [collapsed]);
  const peekOpen = collapsed && peeking;
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <Sidebar
      collapsible="offcanvas"
      variant="floating"
      className={cn(peekOpen && "left-0! z-30")}
      onWheel={onWheel}
      onMouseLeave={() => {
        // A menu or dialog opened from the sidebar keeps it open while the pointer is in it.
        if (!document.querySelector("[role=menu],[role=dialog],[role=alertdialog]")) {
          setPeeking(false);
        }
      }}
      {...contextTarget("sidebar", { createSpace: () => setCreateOpen(true) })}
    >
      {collapsed && !peeking && (
        <div
          aria-hidden
          onMouseEnter={() => setPeeking(true)}
          className="fixed top-(--titlebar-height,0px) bottom-0 left-0 z-20 w-2"
        />
      )}
      <SidebarHeader>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem className="mb-1">
            <SidebarMascot />
          </SidebarMenuItem>
          <SidebarMenuItem className="mb-2">
            <SidebarCustomizeButton />
          </SidebarMenuItem>
          <SidebarNavItems />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden p-2 pt-0">
        {activeSpace ? (
          <div
            // Remounted per Space, which plays the slide.
            key={activeSpace.id}
            className={cn(
              direction && "animate-in duration-200 fade-in motion-reduce:animate-none",
              direction === "next" && "slide-in-from-right-6",
              direction === "previous" && "slide-in-from-left-6",
            )}
          >
            <ActiveSpaceModules space={activeSpace} onOpenDialog={setDialog} />
          </div>
        ) : (
          <p className="px-2 py-6 text-center text-xs text-sidebar-foreground/60">
            Use "+" to create your first Space
          </p>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <CliInstallCard />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UpdateCard />
            <UpdatedCard />
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-0.5">
          <SidebarAddMenu space={activeSpace} onNewSpace={() => setCreateOpen(true)} />
          <SpaceSwitcher
            spaces={spaces}
            activeSpace={activeSpace}
            onActivate={(space) => setActiveSpace(space.id)}
            onOpenDialog={setDialog}
          />
          <span aria-hidden className="mx-1 ml-auto h-4 w-px shrink-0 bg-sidebar-border" />
          <SidebarTrashButton />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={toggleLabel}
                onClick={toggleSidebar}
              >
                {collapsed ? <IconLayoutSidebarLeftExpand /> : <IconLayoutSidebarLeftCollapse />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-2">
              {toggleLabel}
              <ShortcutKbd name="toggleSidebar" />
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarFooter>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SpaceDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </Sidebar>
  );
}
