import { IconClockHour4, IconFolders, IconPin } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityRow } from "@/features/relationships/EntityRow";
import { listEntities } from "@/lib/api/entities";
import { listSpaces } from "@/lib/api/spaces";
import { useNavStore } from "@/lib/store/nav";

/// Single, global, non-duplicable Dashboard (§4.2) — one of the few things
/// allowed to cross the Space hard wall.
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
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
            <p className="px-2 py-4 text-sm text-muted-foreground">Nothing pinned yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
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
            <p className="px-2 py-4 text-sm text-muted-foreground">Nothing yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
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
                // SAFETY: sets a CSS custom property, which `CSSProperties` doesn't model.
                style={{ "--space-color": space.color } as CSSProperties}
              />
              {space.name}
            </button>
          ))}
          {spaces.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">No Spaces yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
