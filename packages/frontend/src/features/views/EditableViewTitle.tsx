import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StatusAnnouncer, StatusIcon } from "#/components/action-feedback.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { labelForType } from "#/lib/entity-title.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";

/// A View's name in its page header, edited in place like a page title: saved when
/// the field loses focus, Enter commits, Escape puts the saved name back.
export function EditableViewTitle({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(entity.title);
  useEffect(() => setTitle(entity.title), [entity.id, entity.title]);

  const rename = useMutation({
    mutationFn: (newTitle: string) => updateEntity(entity.id, { title: newTitle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity", entity.id] });
      queryClient.invalidateQueries({ queryKey: ["view", entity.id] });
      queryClient.invalidateQueries({ queryKey: ["views", entity.spaceId] });
    },
  });

  const placeholder = `Untitled ${labelForType(entity.type)}`;

  return (
    <>
      {/* The hidden copy of the text sizes the field to it exactly; the input itself has no
          width of its own (`w-0`), or its default 20 characters would keep the column open. */}
      <span className="inline-grid min-w-0 max-w-64 font-heading text-base font-medium">
        <span aria-hidden className="invisible col-start-1 row-start-1 truncate whitespace-pre">
          {title || placeholder}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (!title.trim()) setTitle(entity.title);
            else if (title.trim() !== entity.title) rename.mutate(title.trim());
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setTitle(entity.title);
              e.currentTarget.blur();
            }
          }}
          aria-label="View name"
          placeholder={placeholder}
          aria-invalid={rename.isError || undefined}
          className="col-start-1 row-start-1 w-0 min-w-full truncate bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </span>
      {rename.isError && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex shrink-0" aria-label="Couldn't rename, leave the name to retry">
              <StatusIcon status="error" idle={null} size={15} />
            </span>
          </TooltipTrigger>
          <TooltipContent>Couldn't rename, leave the name to retry</TooltipContent>
        </Tooltip>
      )}
      <StatusAnnouncer message={rename.isError ? "Couldn't rename" : null} />
    </>
  );
}
