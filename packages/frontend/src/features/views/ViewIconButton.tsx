import { StatusAnnouncer, StatusIcon } from "#/components/action-feedback.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { useUpdateViewEntity } from "./use-update-view-entity.ts";

/// A View's icon in its page header; clicking it opens the icon and color picker.
export function ViewIconButton({ entity }: { entity: Entity }) {
  const setIcon = useUpdateViewEntity(entity, (icon: string | null) => ({ icon: icon ?? "" }));
  const failed = setIcon.isError;

  return (
    <>
      <IconPicker
        value={entity.icon}
        onChange={(icon) => setIcon.mutate(icon)}
        withColor
        trigger={
          <button
            type="button"
            title={failed ? "Couldn't change icon, try again" : "Change icon"}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
          >
            <StatusIcon
              status={failed ? "error" : "idle"}
              size={17}
              idle={
                <EntityIcon entity={entity} size={17} className="shrink-0 text-muted-foreground" />
              }
            />
          </button>
        }
      />
      <StatusAnnouncer message={failed ? "Couldn't change icon" : null} />
    </>
  );
}
