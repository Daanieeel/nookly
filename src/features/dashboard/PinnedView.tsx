import { IconPin } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { EntityRow } from "@/features/relationships/EntityRow";
import { listEntities } from "@/lib/api/entities";

/// Cross-Space Pinned section (§4.2) — always visible at the top of the sidebar,
/// showing individually pinned items regardless of which Space they live in.
/// Utility view, not primary content — kept visually quieter than a module list.
export function PinnedView() {
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
  });
  const pinned = entities.filter((e) => e.pinned);

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <IconPin size={14} />
        <h1 className="text-sm font-medium">Pinned</h1>
        {pinned.length > 0 && <span className="text-xs">· {pinned.length}</span>}
      </div>
      <div className="flex flex-col">
        {pinned.map((e) => (
          <EntityRow key={e.id} entityId={e.id} currentSpaceId="" />
        ))}
        {pinned.length === 0 && (
          <EmptyState
            icon={IconPin}
            title="Nothing pinned yet"
            description="Pin an item from anywhere to keep it one click away."
          />
        )}
      </div>
    </div>
  );
}
