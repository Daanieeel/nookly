import { IconPin, IconPinFilled, IconTrash } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { IconPicker } from "@/components/icon-picker";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { softDeleteEntity, updateEntity } from "@/lib/api/entities";
import type { Entity } from "@/lib/api/types";
import { labelForType } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

export function EntityDetailLayout({
  entity,
  headerExtra,
  children,
}: {
  entity: Entity;
  /// Small, optional content rendered between the title and the pin/trash
  /// actions — e.g. the Semester page's "Current" badge. Nothing else in the
  /// header varies per entity type (Course page convention).
  headerExtra?: React.ReactNode;
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
  const setIcon = useMutation({
    mutationFn: (icon: string | null) => updateEntity(entity.id, { icon: icon ?? "" }),
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
          <IconPicker
            value={entity.icon}
            onChange={(icon) => setIcon.mutate(icon)}
            trigger={
              <button
                type="button"
                title="Change icon"
                className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
              >
                <EntityIcon entity={entity} size={17} className="shrink-0 text-muted-foreground" />
              </button>
            }
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== entity.title && rename.mutate(title.trim())}
            placeholder={`Untitled ${labelForType(entity.type)}`}
            className="min-w-0 flex-1 truncate bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground"
          />
          {headerExtra}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => togglePin.mutate()}>
                {entity.pinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{entity.pinned ? "Unpin" : "Pin"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => trash.mutate()}>
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
