import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { CommandPalette } from "@/components/command-palette";
import { EntityDetailRouter } from "@/components/entity-detail-router";
import { ModuleView } from "@/components/module-view";
import { AppSidebar } from "@/components/sidebar";
import { Titlebar } from "@/components/titlebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { PinnedView } from "@/features/dashboard/PinnedView";
import { RecentsView } from "@/features/dashboard/RecentsView";
import { TrashView } from "@/features/trash/TrashView";
import { useNavStore } from "@/lib/store/nav";

const queryClient = new QueryClient();

function MainContent() {
  const view = useNavStore((s) => s.view);

  switch (view.kind) {
    case "dashboard":
      return <DashboardView />;
    case "pinned":
      return <PinnedView />;
    case "recents":
      return <RecentsView />;
    case "trash":
      return <TrashView />;
    case "module":
      return (
        <ModuleView spaceId={view.spaceId} module={view.module} filterCourseId={view.filterCourseId} />
      );
    case "entity":
      return <EntityDetailRouter entityId={view.entityId} />;
  }
}

function Shell() {
  const view = useNavStore((s) => s.view);
  const isEntityView = view.kind === "entity";

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
                className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${isEntityView ? "" : "p-6"}`}
              >
                <MainContent />
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
      <CommandPalette />
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
