import { BookmarkSheet } from "#/features/bookmarks/BookmarkSheet.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, Suspense, lazy, useState } from "react";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import { CommandsPalette } from "#/components/commands-palette.tsx";
import { QuickOpenPalette, SearchPalette } from "#/components/search-palette.tsx";
import { AppSidebar } from "#/components/sidebar.tsx";
import { OtherGroupButton, SplitView, useSplitShown } from "#/components/split-view.tsx";
import { TabBar, useTabInteractions } from "#/components/tab-bar.tsx";
import { Titlebar } from "#/components/titlebar.tsx";
import { SidebarInset, SidebarProvider } from "@nookly/ui/components/sidebar";
import { AppToaster } from "#/components/app-toaster.tsx";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { DashboardView } from "#/features/dashboard/DashboardView.tsx";
import { QuickJotDialog } from "#/features/notes/QuickJot.tsx";
import { CrashReportDialog } from "#/features/crash-report/CrashReportDialog.tsx";
import { ImportDialog } from "#/features/notes/ImportDialog.tsx";
import { SpellcheckPrompt } from "#/features/spellcheck/SpellcheckPrompt.tsx";
import { NewTaskDialog } from "#/features/tasks/NewTaskDialog.tsx";
import { useAutoBackup } from "#/features/backup/backup-run.ts";
import { useExternalCalendarSync } from "#/features/sessions/external-calendars/external-calendar-sync.ts";
import { useExternalDbChanges } from "#/hooks/use-external-db-changes.ts";
import { usePastePlainText } from "#/hooks/use-paste-plain-text.ts";
import { useScopedSelectAll } from "#/hooks/use-scoped-select-all.ts";
import { deepLinks, openDeepLink } from "#/lib/deep-link.ts";

// The entry point starts the deep links once the app has loaded; one static import keeps
// the module in one chunk.
export { startDeepLinks } from "#/lib/deep-link.ts";
import { useRefreshBlocksOnRename } from "#/lib/rename-sync.ts";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import { useEffect } from "react";
import { createQueryClient } from "#/lib/query-client.ts";
import "#/context-actions.ts";

const queryClient = createQueryClient();

// The views other than the Dashboard load when they are first opened, so starting Nookly does
// not read and compile every module's code up front.
const EntityDetailRouter = lazy(() =>
  import("#/components/entity-detail-router.tsx").then((m) => ({ default: m.EntityDetailRouter })),
);
const ModuleView = lazy(() =>
  import("#/components/module-view.tsx").then((m) => ({ default: m.ModuleView })),
);
const AssignmentsOverviewView = lazy(() =>
  import("#/features/assignments/AssignmentsOverviewView.tsx").then((m) => ({
    default: m.AssignmentsOverviewView,
  })),
);
const TasksOverviewView = lazy(() =>
  import("#/features/tasks/TasksOverviewView.tsx").then((m) => ({ default: m.TasksOverviewView })),
);
const UnifiedCalendarView = lazy(() =>
  import("#/features/calendar/UnifiedCalendarView.tsx").then((m) => ({
    default: m.UnifiedCalendarView,
  })),
);
const TrashView = lazy(() =>
  import("#/features/trash/TrashView.tsx").then((m) => ({ default: m.TrashView })),
);
const SettingsDialog = lazy(() =>
  import("#/features/settings/SettingsDialog.tsx").then((m) => ({ default: m.SettingsDialog })),
);
const WhatsNewDialog = lazy(() =>
  import("#/features/whats-new/WhatsNewDialog.tsx").then((m) => ({ default: m.WhatsNewDialog })),
);
const QuickAssignmentDialog = lazy(() =>
  import("#/features/assignments/QuickAssignmentDialog.tsx").then((m) => ({
    default: m.QuickAssignmentDialog,
  })),
);

/// Loads a dialog's code the first time it opens, then keeps it mounted so it can close with
/// its own animation.
function OnFirstOpen({ open, children }: { open: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <Suspense fallback={null}>{children}</Suspense> : null;
}

const PinnedView = lazy(() =>
  import("#/features/dashboard/PinnedView.tsx").then((m) => ({ default: m.PinnedView })),
);

/// A tab group's active view.
function MainContent({ view }: { view: View }) {
  return (
    <Suspense fallback={null}>
      <ViewSwitch view={view} />
    </Suspense>
  );
}

function ViewSwitch({ view }: { view: View }) {
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

/// Opens the `nookly://` links that reach the app, the one that started it included: they
/// wait in `deepLinks` until the app is up and this is mounted.
function useDeepLinks() {
  useEffect(() => deepLinks.attach((url) => void openDeepLink(url)), []);
}

function Shell() {
  useRefreshBlocksOnRename();
  useDeepLinks();
  const splitShown = useSplitShown();
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const twoGroups = useNavStore((s) => s.groups.length > 1);
  // With one group (or no room for two) its tabs sit under the titlebar, while there
  // is more than one tab or another group to switch to. Split, each group has its own.
  const showTabBar = useNavStore((s) => !splitShown && (s.tabs.length > 1 || twoGroups));
  const settingsOpen = useNavStore((s) => s.settingsOpen);
  const whatsNewOpen = useNavStore((s) => s.whatsNewOpen);
  const newAssignmentOpen = useNavStore((s) => s.newAssignmentOpen);
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
      <SearchPalette />
      <QuickOpenPalette />
      <CommandsPalette />
      <QuickJotDialog />
      <OnFirstOpen open={settingsOpen}>
        <SettingsDialog />
      </OnFirstOpen>
      <ImportDialog />
      <NewTaskDialog />
      <OnFirstOpen open={newAssignmentOpen}>
        <QuickAssignmentDialog />
      </OnFirstOpen>
      <OnFirstOpen open={whatsNewOpen}>
        <WhatsNewDialog />
      </OnFirstOpen>
      <CrashReportDialog />
      <SpellcheckPrompt />
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
