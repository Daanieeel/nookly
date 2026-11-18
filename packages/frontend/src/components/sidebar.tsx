import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useState } from "react";
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
import { listSpaceModules, listSpaces } from "#/lib/api/spaces.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cycleSpaceId } from "#/lib/space-row.ts";
import { useSwipeHint } from "#/lib/swipe-hint.ts";
import { cn } from "@nookly/ui/lib/utils";
import { UpdateCard } from "#/components/update-card.tsx";
import { UpdatedCard } from "#/components/updated-card.tsx";
import { ActiveSpaceModules, SpaceHeader } from "./sidebar/active-space-modules";
import { CliInstallCard } from "./sidebar/cli-install-card";
import {
  SidebarCustomizeButton,
  SidebarNavItems,
  SidebarTrashButton,
} from "./sidebar/sidebar-items";
import { useSpacePager } from "./sidebar/use-space-pager";
import { ProgressiveBlur } from "./sidebar/progressive-blur";
import { SidebarMascot } from "./sidebar/sidebar-mascot";
import { SwipeHint } from "./sidebar/swipe-hint";
import { CreateSpaceDialog, type SpaceDialog, SpaceDialogs } from "./sidebar/space-dialogs";
import { SidebarAddMenu, SpaceSwitcher } from "./sidebar/space-switcher";
import { qk } from "#/lib/query-keys.ts";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { useElementHeight } from "#/hooks/use-element-height.ts";

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
  const pager = useSpacePager({
    ids: spaces.map((s) => s.id),
    activeId: activeSpace?.id ?? null,
    onSwipe: (id) => {
      setActiveSpace(id);
      useSwipeHint.getState().markDone();
    },
  });
  // The Spaces on either side are fetched ahead, so one that slides in during a swipe has its
  // modules at once instead of drawing empty first.
  const activeIndex = spaces.findIndex((s) => s.id === activeSpace?.id);
  const nearbyIds = [spaces[activeIndex - 1]?.id, spaces[activeIndex + 1]?.id].filter(
    (id) => id !== undefined,
  );
  useEffect(() => {
    for (const id of nearbyIds) {
      void queryClient.prefetchQuery({
        queryKey: qk.spaceModules(id),
        queryFn: () => listSpaceModules(id),
      });
    }
    // `nearbyIds` is rebuilt every render; its content is what matters.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [queryClient, nearbyIds.join()]);
  // The Space that is shown, and the one beside it while one slides in.
  const panes = [pager.shownId, pager.neighborId].flatMap(
    (id) => spaces.find((s) => s.id === id) ?? [],
  );

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
  // The footer floats over the end of the list, which scrolls behind its fade, so the list
  // leaves room for the footer's height at its end.
  const [footerRef, footerHeight] = useElementHeight();

  return (
    <Sidebar
      collapsible="offcanvas"
      variant="floating"
      className={cn(peekOpen && "left-0! z-30")}
      // Over the page it needs a surface of its own (`styles.css`); in place the window
      // shows through.
      data-peek={peekOpen ? "" : undefined}
      onWheel={pager.onWheel}
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

      <div ref={pager.stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* A pane per Space on screen: the shown one, and the next or previous one while a swipe
            has it half in. Each is a header over its own scrolling list, so the whole Space
            moves together, and the name stays put however the list inside scrolls. */}
        {panes.map((space) => (
          <div
            key={space.id}
            ref={pager.paneRef(space.id)}
            data-space-pane={space.id}
            className="absolute inset-0 flex flex-col"
          >
            <div className="shrink-0 px-2 pb-1">
              <SpaceHeader space={space} onOpenDialog={setDialog} />
            </div>
            <SidebarContent
              className="overflow-x-hidden p-2 pt-0 pb-(--sidebar-footer-height) overscroll-contain"
              // SAFETY: `--sidebar-footer-height` is a plain pixel length — `CSSProperties` just
              // doesn't model custom properties.
              style={{ "--sidebar-footer-height": `${footerHeight}px` } as CSSProperties}
            >
              <ActiveSpaceModules space={space} />
            </SidebarContent>
          </div>
        ))}
        {panes.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-sidebar-foreground/60">
            Use "+" to create your first Space
          </p>
        )}

        <SidebarFooter ref={footerRef} className="absolute inset-x-0 bottom-0 z-10">
          {/* The list scrolls behind a blur that is strongest at the bottom and tapers off upward. */}
          <ProgressiveBlur />
          <SidebarMenu>
            <SidebarMenuItem>
              <CliInstallCard />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <UpdateCard />
              <UpdatedCard />
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex flex-col gap-1">
            <SwipeHint spaceCount={spaces.length} />
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
                    {collapsed ? (
                      <IconLayoutSidebarLeftExpand />
                    ) : (
                      <IconLayoutSidebarLeftCollapse />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex items-center gap-2">
                  {toggleLabel}
                  <ShortcutKbd name="toggleSidebar" />
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </SidebarFooter>
      </div>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SpaceDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </Sidebar>
  );
}
