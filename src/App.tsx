import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "@/components/command-palette";
import { EntityDetailRouter } from "@/components/entity-detail-router";
import { ModuleView } from "@/components/module-view";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { PinnedView } from "@/features/dashboard/PinnedView";
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
    case "trash":
      return <TrashView />;
    case "module":
      return <ModuleView spaceId={view.spaceId} module={view.module} />;
    case "entity":
      return <EntityDetailRouter entityId={view.entityId} />;
  }
}

function Shell() {
  const view = useNavStore((s) => s.view);
  const isEntityView = view.kind === "entity";

  return (
    <div className="flex h-screen gap-3 bg-background p-3 text-foreground">
      <SidebarProvider className="min-h-full">
        <AppSidebar />
        <SidebarInset className="min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-md">
            <div className={`min-h-0 flex-1 overflow-y-auto ${isEntityView ? "" : "p-6"}`}>
              <MainContent />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
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
