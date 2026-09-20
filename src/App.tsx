import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { CommandPalette } from "@/components/command-palette";
import { EntityDetailRouter } from "@/components/entity-detail-router";
import { ModuleView } from "@/components/module-view";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { PinnedView } from "@/features/dashboard/PinnedView";
import { TrashView } from "@/features/trash/TrashView";
import { listSpaces } from "@/lib/api/spaces";
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
      return <TrashView spaceId={view.spaceId} />;
    case "module":
      return <ModuleView spaceId={view.spaceId} module={view.module} />;
    case "entity":
      return <EntityDetailRouter entityId={view.entityId} />;
  }
}

/// The active Space's color bleeds into the UI beyond the sidebar label (§4.1/§9) —
/// a thin accent bar along the top edge of the main panel.
function useSpaceAccent() {
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  return spaces.find((s) => s.id === activeSpaceId)?.color;
}

function Shell() {
  const accent = useSpaceAccent();
  const view = useNavStore((s) => s.view);
  const isEntityView = view.kind === "entity";

  return (
    <div className="flex h-screen w-screen gap-3 bg-background p-3 text-foreground">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-md">
        <div
          className="h-[3px] shrink-0 bg-(--space-accent)"
          // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
          style={{ "--space-accent": accent ?? "transparent" } as CSSProperties}
        />
        <div className={`min-h-0 flex-1 overflow-y-auto ${isEntityView ? "" : "p-6"}`}>
          <MainContent />
        </div>
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
