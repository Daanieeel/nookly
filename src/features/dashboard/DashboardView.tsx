import { IconClockHour4, IconFolders, IconLayoutDashboard, IconPin } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardBriefing } from "@/features/dashboard/DashboardBriefing";
import { EntityRow } from "@/features/relationships/EntityRow";
import { listEntities } from "@/lib/api/entities";
import { listSpaces } from "@/lib/api/spaces";
import { useNavStore } from "@/lib/store/nav";

/// Single, global, non-duplicable Dashboard (§4.2) — one of the few things
/// allowed to cross the Space hard wall.
///
/// Laid out as a bento grid with deliberately non-uniform tiles (§2.3) — Recent
/// gets a big 2x2 anchor tile via CSS grid auto-placement, Pinned takes the
/// remaining top row, and Spaces/Stats split the bottom row into two small
/// tiles — so this page reads as "a dashboard" at a glance, not another list.
export function DashboardView() {
  const setView = useNavStore((s) => s.setView);
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  const pinned = entities.filter((e) => e.pinned);
  const recent = [...entities].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <DashboardBriefing />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="col-span-1 min-h-32 sm:col-span-2 lg:col-span-2 lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconClockHour4 size={16} className="text-muted-foreground" /> Recent
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 pb-4">
            {recent.map((e) => (
              <EntityRow key={e.id} entityId={e.id} currentSpaceId="" />
            ))}
            {recent.length === 0 && (
              <EmptyState icon={IconClockHour4} title="Nothing yet" compact />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 min-h-32 sm:col-span-2 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconPin size={16} className="text-muted-foreground" /> Pinned
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 pb-4">
            {pinned.map((e) => (
              <EntityRow key={e.id} entityId={e.id} currentSpaceId="" />
            ))}
            {pinned.length === 0 && (
              <EmptyState icon={IconPin} title="Nothing pinned yet" compact />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 min-h-32">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconFolders size={16} className="text-muted-foreground" /> Spaces
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pb-4">
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => setView({ kind: "module", spaceId: space.id, module: "tasks" })}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                <span
                  className="inline-block size-2 rounded-full bg-(--space-color)"
                  // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
                  // string — `CSSProperties` just doesn't model custom properties.
                  style={{ "--space-color": space.color } as CSSProperties}
                />
                {space.name}
              </button>
            ))}
            {spaces.length === 0 && <EmptyState icon={IconFolders} title="No Spaces yet" compact />}
          </CardContent>
        </Card>

        <Card className="col-span-1 min-h-32">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconLayoutDashboard size={16} className="text-muted-foreground" /> Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pb-4">
            <Stat label="Entities" value={entities.length} />
            <Stat label="Spaces" value={spaces.length} />
            <Stat label="Pinned" value={pinned.length} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between px-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
