import { IconPin, IconPinFilled, IconTrash } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { softDeleteEntity, updateEntity } from "@/lib/api/entities";
import type { Entity } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";

export function EntityDetailLayout({
  entity,
  children,
}: {
  entity: Entity;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const setView = useNavStore((s) => s.setView);
  const [title, setTitle] = useState(entity.title);

  useEffect(() => setTitle(entity.title), [entity.id, entity.title]);

  const rename = useMutation({
    mutationFn: (newTitle: string) => updateEntity(entity.id, { title: newTitle }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
  });
  const togglePin = useMutation({
    mutationFn: () => updateEntity(entity.id, { pinned: !entity.pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
  });
  const trash = useMutation({
    mutationFn: () => softDeleteEntity(entity.id),
    onSuccess: () => setView({ kind: "dashboard" }),
  });

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <EntityIcon entity={entity} size={18} className="shrink-0 text-muted-foreground" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== entity.title && rename.mutate(title.trim())}
            className="min-w-0 flex-1 truncate bg-transparent text-base font-medium outline-none"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={() => togglePin.mutate()}
              >
                {entity.pinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{entity.pinned ? "Unpin" : "Pin"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={() => trash.mutate()}
              >
                <IconTrash size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move to Trash</TooltipContent>
          </Tooltip>
        </div>
        <div className="min-w-0 flex-1 p-4">{children}</div>
      </div>
      <RightSidebar entity={entity} />
    </div>
  );
}
