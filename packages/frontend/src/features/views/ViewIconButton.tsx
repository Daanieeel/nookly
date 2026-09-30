import { qk } from "#/lib/query-keys.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StatusAnnouncer, StatusIcon } from "#/components/action-feedback.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";

/// A View's icon in its page header; clicking it opens the icon and color picker.
export function ViewIconButton({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const setIcon = useMutation({
    mutationFn: (icon: string | null) => updateEntity(entity.id, { icon: icon ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.entity.byId(entity.id) });
      queryClient.invalidateQueries({ queryKey: qk.views.byId(entity.id) });
      queryClient.invalidateQueries({ queryKey: qk.views.bySpace(entity.spaceId) });
    },
  });
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
