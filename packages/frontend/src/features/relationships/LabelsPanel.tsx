import { IconPlus, IconTag } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateLabel } from "#/components/label-manager.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { Button } from "@nookly/ui/components/button";
import { LabelsPicker } from "#/features/tasks/task-properties.tsx";
import { attachLabel, detachLabel, listLabels, listLabelsForEntity } from "#/lib/api/labels.ts";
import type { Entity } from "#/lib/api/types.ts";
import { SidebarSection } from "./SidebarSection";

/// A generic Labels section for any entity type that doesn't already show one
/// inline (Task and Sub-task keep it in their own properties panel instead).
export function LabelsPanel({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const { data: spaceLabels = [] } = useQuery({
    queryKey: ["labels", entity.spaceId],
    queryFn: () => listLabels(entity.spaceId),
  });
  const { data: attached = [] } = useQuery({
    queryKey: ["entity-labels", entity.id],
    queryFn: () => listLabelsForEntity(entity.id),
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["entity-labels", entity.id] }),
      queryClient.invalidateQueries({ queryKey: ["labels", entity.spaceId] }),
    ]);

  const toggle = useMutation({
    mutationFn: async (labelId: string) => {
      if (attached.some((l) => l.id === labelId)) await detachLabel(entity.id, labelId);
      else await attachLabel(entity.id, labelId);
      await refresh();
    },
  });
  const createLabel = useCreateLabel(entity.spaceId);

  return (
    <SidebarSection icon={<IconTag size={14} />} title="Labels" count={attached.length}>
      <LabelsPicker
        labels={spaceLabels}
        selected={attached.map((l) => l.id)}
        onToggle={(id) => !toggle.isPending && toggle.mutate(id)}
        pendingId={toggle.isPending ? toggle.variables : undefined}
        failedId={toggle.isError ? toggle.variables : undefined}
        onCreate={(name) =>
          createLabel.mutate(name, { onSuccess: (label) => toggle.mutate(label.id) })
        }
        creating={createLabel.isPending}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-auto min-h-7 w-full flex-wrap justify-start gap-1 px-2 py-1 font-normal"
        >
          {attached.length > 0 ? (
            attached.map((label) => <LabelChip key={label.id} label={label} />)
          ) : (
            <>
              <IconPlus size={14} />
              Add labels…
            </>
          )}
        </Button>
      </LabelsPicker>
    </SidebarSection>
  );
}
