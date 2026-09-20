import { useQuery } from "@tanstack/react-query";
import { EntityIcon } from "@/components/entity-icon";
import { SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { listCourses } from "@/lib/api/courses";
import { listRecentNotes } from "@/lib/api/notes";
import { displayTitle } from "@/lib/entity-title";
import { MODULE_LABELS } from "@/lib/modules";
import { useNavStore, type ModuleKey } from "@/lib/store/nav";

const MAX_CHILDREN = 5;

export const EXPANDABLE_MODULE_KEYS = new Set<ModuleKey>(["courses", "notes"]);

export function ExpandableModuleChildren({
  moduleKey,
  spaceId,
  open,
}: {
  moduleKey: ModuleKey;
  spaceId: string;
  open: boolean;
}) {
  const isCourses = moduleKey === "courses";
  const { data = [] } = useQuery({
    queryKey: [isCourses ? "courses" : "recent-notes", spaceId],
    queryFn: () => (isCourses ? listCourses(spaceId) : listRecentNotes(spaceId, MAX_CHILDREN)),
    enabled: open && EXPANDABLE_MODULE_KEYS.has(moduleKey),
  });

  if (!open || !EXPANDABLE_MODULE_KEYS.has(moduleKey)) return null;
  const children = data.slice(0, MAX_CHILDREN);

  return (
    <>
      {children.map((child) => (
        <SidebarMenuSubItem key={child.id}>
          <SidebarMenuSubButton
            onClick={() => useNavStore.getState().openEntity(child.id, spaceId)}
          >
            <EntityIcon entity={child} size={14} />
            <span className="truncate">{displayTitle(child)}</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
      {children.length === 0 && (
        <SidebarMenuSubItem>
          <p className="px-2 py-1 text-xs text-sidebar-foreground/50">Nothing here yet</p>
        </SidebarMenuSubItem>
      )}
      {children.length > 0 && (
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            onClick={() =>
              useNavStore.getState().setView({ kind: "module", spaceId, module: moduleKey })
            }
          >
            <span className="truncate text-sidebar-foreground/50">
              Show all {MODULE_LABELS[moduleKey]} →
            </span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </>
  );
}
