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
import { OtherGroupButton, SplitView, useSplitShown } from "#/components/split-view.tsx";
import { TabBar, useTabInteractions } from "#/components/tab-bar.tsx";
import { Titlebar } from "#/components/titlebar.tsx";
import { SidebarInset, SidebarProvider } from "@nookly/ui/components/sidebar";
import { AppToaster } from "#/components/app-toaster.tsx";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { AssignmentsOverviewView } from "#/features/assignments/AssignmentsOverviewView.tsx";
import { TasksOverviewView } from "#/features/tasks/TasksOverviewView.tsx";
import { UnifiedCalendarView } from "#/features/calendar/UnifiedCalendarView.tsx";
import { DashboardView } from "#/features/dashboard/DashboardView.tsx";
import { PinnedView } from "#/features/dashboard/PinnedView.tsx";
import { QuickJotDialog } from "#/features/notes/QuickJot.tsx";
import { WhatsNewDialog } from "#/features/whats-new/WhatsNewDialog.tsx";
import { ImportDialog } from "#/features/notes/ImportDialog.tsx";
import { SettingsDialog } from "#/features/settings/SettingsDialog.tsx";
import { useAutoBackup } from "#/features/backup/backup-run.ts";
import { useExternalCalendarSync } from "#/features/sessions/external-calendars/external-calendar-sync.ts";
import { TrashView } from "#/features/trash/TrashView.tsx";
import { useExternalDbChanges } from "#/hooks/use-external-db-changes.ts";
import { usePastePlainText } from "#/hooks/use-paste-plain-text.ts";
import { useScopedSelectAll } from "#/hooks/use-scoped-select-all.ts";
import { useRefreshBlocksOnRename } from "#/lib/rename-sync.ts";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import "#/context-actions.ts";

const queryClient = new QueryClient();

/// A tab group's active view.
function MainContent({ view }: { view: View }) {
  switch (view.kind) {
    case "dashboard":
      return <DashboardView />;
    case "pinned":
      return <PinnedView />;
    case "calendar":
      return <UnifiedCalendarView />;
    case "tasks":
      return <TasksOverviewView viewId={view.viewId} />;
    case "assignments":
      return <AssignmentsOverviewView viewId={view.viewId} />;
    case "trash":
      return <TrashView />;
    case "module":
      return (
        <ModuleView
          spaceId={view.spaceId}
          module={view.module}
          filterCourseId={view.filterCourseId}
          viewId={view.viewId}
        />
      );
    case "entity":
      // Keyed so switching between two pages remounts the editor instead of
      // keeping the previous page's hydrated state.
      return <EntityDetailRouter key={view.entityId} entityId={view.entityId} />;
  }
}

function Shell() {
  useRefreshBlocksOnRename();
  const splitShown = useSplitShown();
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const twoGroups = useNavStore((s) => s.groups.length > 1);
  // With one group (or no room for two) its tabs sit under the titlebar, while there
  // is more than one tab or another group to switch to. Split, each group has its own.
  const showTabBar = useNavStore((s) => !splitShown && (s.tabs.length > 1 || twoGroups));
  useTabInteractions();
  useExternalDbChanges();
  useExternalCalendarSync();
  useAutoBackup();
  useScopedSelectAll();
  usePastePlainText();
  // Formatters read the date settings directly; re-rendering from the root applies
  // a changed format everywhere at once.
  useDateTimeSettings((s) => `${s.timezone}|${s.dateFormat}|${s.timeFormat}`);

  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
      // SAFETY: `--titlebar-height` only ever receives this fixed rem value,
      // matching `Titlebar`'s own `h-11`, plus the `h-9` tab bar while it shows — `CSSProperties` just doesn't model
      // custom properties. Read by the sidebar primitive's fixed rail so it
      // starts below the titlebar instead of painting over it.
      style={
        {
          "--titlebar-height": showTabBar ? "5rem" : "2.75rem",
        } as CSSProperties
      }
    >
      <Titlebar />
      {showTabBar && (
        <TabBar groupId={focusedGroupId} trailing={twoGroups ? <OtherGroupButton /> : undefined} />
      )}
      {/* With the sidebar collapsed the page goes edge to edge: no padding, corners or shadow.
          The vertical padding is the floating sidebar's own (`p-2`), so the page and the sidebar
          panel share their top and bottom edges. */}
      <div className="group/app flex min-h-0 flex-1 gap-3 px-3 py-2 has-[[data-slot=sidebar][data-state=collapsed]]:p-0">
        <SidebarProvider className="min-h-full">
          <AppSidebar />
          <SidebarInset className="min-h-0 min-w-0">
            <SplitView renderGroup={(scope) => <MainContent view={scope.view} />} />
          </SidebarInset>
        </SidebarProvider>
      </div>
      <CommandPalette />
      <QuickSwitcher />
      <CommandsPalette />
      <QuickJotDialog />
      <SettingsDialog />
      <ImportDialog />
      <WhatsNewDialog />
      <BookmarkSheet />
      <ContextMenuHost />
      <AppToaster />
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
