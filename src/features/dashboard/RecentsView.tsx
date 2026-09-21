import { IconHistory } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityRow } from "@/features/relationships/EntityRow";
import { listEntities } from "@/lib/api/entities";
import { useNavStore } from "@/lib/store/nav";

/// Cross-Space Recents page (§4.4) — the last few entities actually opened,
/// any type, any Space. Distinct from Pinned's manually-curated nature.
export function RecentsView() {
  const recents = useNavStore((s) => s.recents);
  const pruneRecents = useNavStore((s) => s.pruneRecents);
  // Same query PinnedView uses — already excludes deleted entities, so it
  // doubles as the "is this recent entry still valid" source of truth.
  const { data: entities } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
  });

  useEffect(() => {
    if (!entities) return;
    pruneRecents(new Set(entities.map((e) => e.id)));
  }, [entities, pruneRecents]);

  const loaded = entities !== undefined;
  const validIds = new Set((entities ?? []).map((e) => e.id));
  // While entities are still loading, show the stored list as-is rather than
  // flashing the empty state.
  const visible = loaded ? recents.filter((r) => validIds.has(r.entityId)) : recents;

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <IconHistory size={14} />
        <h1 className="text-sm font-medium">Recents</h1>
        {visible.length > 0 && <span className="text-xs">· {visible.length}</span>}
      </div>
      <div className="flex flex-col">
        {visible.map((r) => (
          <EntityRow key={r.entityId} entityId={r.entityId} currentSpaceId={r.spaceId} />
        ))}
        {loaded && visible.length === 0 && (
          <EmptyState
            icon={IconHistory}
            title="Nothing opened yet"
            description="Entities you open will show up here for quick access."
          />
        )}
      </div>
    </div>
  );
}
