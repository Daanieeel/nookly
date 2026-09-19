import { useQuery } from "@tanstack/react-query";
import { EntityRow } from "@/features/relationships/EntityRow";
import { listEntities } from "@/lib/api/entities";

/// Cross-Space Pinned section (§4.2) — always visible at the top of the sidebar,
/// showing individually pinned items regardless of which Space they live in.
export function PinnedView() {
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
  });
  const pinned = entities.filter((e) => e.pinned);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Pinned</h1>
      <div className="flex flex-col">
        {pinned.map((e) => (
          <EntityRow key={e.id} entityId={e.id} currentSpaceId="" />
        ))}
        {pinned.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing pinned yet.</p>
        )}
      </div>
    </div>
  );
}
