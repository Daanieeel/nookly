import { BookmarkSheet } from "#/features/bookmarks/BookmarkSheet.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { CommandPalette } from "#/components/command-palette.tsx";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import { CommandsPalette } from "#/components/commands-palette.tsx";
import { QuickSwitcher } from "#/components/quick-switcher.tsx";
import { EntityDetailRouter } from "#/components/entity-detail-router.tsx";
import { ModuleView } from "#/components/module-view.tsx";
import { AppSidebar } from "#/components/sidebar.tsx";
import { Titlebar } from "#/components/titlebar.tsx";
import { SidebarInset, SidebarProvider } from "@nookly/ui/components/sidebar";
import { Toaster } from "@nookly/ui/components/sonner";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { DashboardView } from "#/features/dashboard/DashboardView.tsx";
import { PinnedView } from "#/features/dashboard/PinnedView.tsx";
import { QuickJotDialog } from "#/features/notes/QuickJot.tsx";
import { useExternalCalendarSync } from "#/features/sessions/external-calendars/external-calendar-sync.ts";
import { TrashView } from "#/features/trash/TrashView.tsx";
import { useExternalDbChanges } from "#/hooks/use-external-db-changes.ts";
import { useScopedSelectAll } from "#/hooks/use-scoped-select-all.ts";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import "#/context-actions.ts";

const queryClient = new QueryClient();

function MainContent() {
  const view = useNavStore((s) => s.view);

  switch (view.kind) {
    case "dashboard":
      return <DashboardView />;
    case "pinned":
      return <PinnedView />;
    case "trash":
      return <TrashView />;
    case "module":
      return (
        <ModuleView
          spaceId={view.spaceId}
          module={view.module}
          filterCourseId={view.filterCourseId}
        />
      );
    case "entity":
      // Keyed so switching between two pages remounts the editor instead of
      // keeping the previous page's hydrated state.
      return <EntityDetailRouter key={view.entityId} entityId={view.entityId} />;
  }
}

function Shell() {
  const view = useNavStore((s) => s.view);
  useExternalDbChanges();
  useExternalCalendarSync();
  useScopedSelectAll();
  // Formatters read the date settings directly; re-rendering from the root applies
  // a changed format everywhere at once.
  useDateTimeSettings((s) => `${s.timezone}|${s.dateFormat}|${s.timeFormat}`);
  const isEntityView = view.kind === "entity";
  // Views drawing their own edge to edge chrome, like the Linear style Tasks page.
  const isBleedView =
    isEntityView ||
    (view.kind === "module" &&
      ["tasks", "sessions", "assignments", "exams", "decks", "files", "bookmarks"].includes(
        view.module,
      ));

  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
      // SAFETY: `--titlebar-height` only ever receives this fixed rem value,
      // matching `Titlebar`'s own `h-11` — `CSSProperties` just doesn't model
      // custom properties. Read by the sidebar primitive's fixed rail so it
      // starts below the titlebar instead of painting over it.
      style={{ "--titlebar-height": "2.75rem" } as CSSProperties}
    >
      <Titlebar />
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <SidebarProvider className="min-h-full">
          <AppSidebar />
          <SidebarInset className="min-h-0 min-w-0">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-md">
              <div
                className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${isBleedView ? "" : "p-6"}`}
              >
                <MainContent />
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
      <CommandPalette />
      <QuickSwitcher />
      <CommandsPalette />
      <QuickJotDialog />
      <BookmarkSheet />
      <ContextMenuHost />
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <Shell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
