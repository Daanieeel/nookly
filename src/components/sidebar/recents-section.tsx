import { IconChevronRight, IconHistory } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { getEntity } from "@/lib/api/entities";
import type { Space } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

function RecentRow({
  entityId,
  spaceId,
  spaces,
}: {
  entityId: string;
  spaceId: string;
  spaces: Space[];
}) {
  const { data: entity } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => getEntity(entityId),
  });
  // Trashed entities drop out of Recents entirely rather than rendering dimmed.
  if (!entity || entity.deletedAt) return null;
  const space = spaces.find((s) => s.id === spaceId);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => useNavStore.getState().openEntity(entity.id, spaceId)}>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <EntityIcon entity={entity} size={14} />
          <span className="truncate">{displayTitle(entity)}</span>
        </span>
        {space && (
          <span
            className="ml-auto size-1.5 shrink-0 rounded-full bg-(--space-color)"
            // SAFETY: `--space-color` only ever receives `space.color`, a plain hex
            // string — `CSSProperties` just doesn't model custom properties.
            style={{ "--space-color": space.color } as CSSProperties}
          />
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function RecentsSection({ spaces }: { spaces: Space[] }) {
  const recents = useNavStore((s) => s.recents);
  if (recents.length === 0) return null;

  return (
    <Collapsible defaultOpen className="group/recents">
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex w-full cursor-pointer items-center justify-between">
            <span className="flex items-center gap-1.5">
              <IconHistory className="size-3.5" />
              Recents
            </span>
            <IconChevronRight className="size-3.5 transition-transform group-data-[state=open]/recents:rotate-90" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenu>
            {recents.map((r) => (
              <RecentRow
                key={r.entityId}
                entityId={r.entityId}
                spaceId={r.spaceId}
                spaces={spaces}
              />
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
