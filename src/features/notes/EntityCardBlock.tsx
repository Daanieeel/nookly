import { IconReplace } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { formatDistanceToNow } from "date-fns";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityIcon } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
import { EntityPickerList, EntityPickerPopover } from "@/components/entity-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getEntity } from "@/lib/api/entities";
import { listSpaces } from "@/lib/api/spaces";
import type { Entity } from "@/lib/api/types";
import { displayTitle, labelForType } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { mentionMarkdown } from "@/features/relationships/mention-utils";
import { asString, type JSONAttrValue } from "./block-markdown";
import { prefetchBlocks } from "./blocks-query";

export interface EntityCardOptions {
  /// The Space the page lives in, for the picker and the other Space badge.
  spaceId: string;
  /// The page itself, left out of the picker.
  pageId: string;
}

const MENTION = /^\[[^\]]*\]\(mention:([a-zA-Z0-9-]+)\)$/;

/// A live card for another entity (a Task, an Exam, a Course, ...). The block
/// stores a mention link to it, so the card also lists under that entity's
/// "Mentioned in" like any other mention.
export function EntityCardBlock({ node, updateAttributes, extension, editor }: ReactNodeViewProps) {
  // SAFETY: `EntityCard` is always configured with `EntityCardOptions` (`BlockEditor`).
  const { spaceId, pageId } = extension.options as EntityCardOptions;
  // SAFETY: the entity card node only ever writes `rows` as a string.
  const link = asString(node.attrs.rows as JSONAttrValue | undefined) ?? "";
  const entityId = MENTION.exec(link.trim())?.[1];
  const pick = (entity: Entity) =>
    updateAttributes({ rows: mentionMarkdown(displayTitle(entity), entity.id) });

  return (
    <NodeViewWrapper className="my-1" contentEditable={false}>
      {entityId ? (
        <EntityCard
          entityId={entityId}
          spaceId={spaceId}
          editable={editor.isEditable}
          onPick={pick}
        />
      ) : (
        <div className="entity-card-picker">
          <EntityPickerList spaceId={spaceId} exclude={pageId} onSelect={pick} />
        </div>
      )}
    </NodeViewWrapper>
  );
}

function EntityCard({
  entityId,
  spaceId,
  editable,
  onPick,
}: {
  entityId: string;
  spaceId: string;
  editable: boolean;
  onPick: (entity: Entity) => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: entity, isError } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => getEntity(entityId),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  if (isError) {
    return (
      <div className="entity-card text-sm text-muted-foreground">This item no longer exists.</div>
    );
  }
  if (!entity) return <div className="entity-card h-14 animate-pulse" />;

  const otherSpace =
    entity.spaceId !== spaceId ? spaces.find((s) => s.id === entity.spaceId) : undefined;

  return (
    <div className="group/card entity-card flex items-center gap-3">
      <button
        type="button"
        onClick={() => openEntity(entity.id, entity.spaceId)}
        onMouseEnter={() => prefetchBlocks(queryClient, entity.id)}
        {...entityTarget(entity)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 text-left outline-none",
          entity.deletedAt && "opacity-50",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
          <EntityIcon entity={entity} size={18} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{displayTitle(entity)}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <EntityKey entityKey={entity.key} />
            <span>{labelForType(entity.type)}</span>
            <span aria-hidden>·</span>
            <span className="truncate">
              {entity.deletedAt
                ? "In Trash"
                : `Updated ${formatDistanceToNow(new Date(entity.updatedAt), { addSuffix: true })}`}
            </span>
          </span>
        </span>
      </button>
      {otherSpace && (
        <Badge variant="outline" className="shrink-0">
          {otherSpace.name}
        </Badge>
      )}
      {editable && (
        <span className="flex shrink-0 opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100">
          <EntityPickerPopover
            spaceId={spaceId}
            exclude={entity.id}
            onSelect={onPick}
            trigger={
              <span className="flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label="Change Linked Item"
                      className="size-7"
                    >
                      <IconReplace className="size-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Change Linked Item</TooltipContent>
                </Tooltip>
              </span>
            }
          />
        </span>
      )}
    </div>
  );
}
