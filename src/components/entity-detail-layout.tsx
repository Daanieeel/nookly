import { IconRestore, IconTrashFilled } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  useActionStatus,
} from "@/components/action-feedback";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityActions } from "@/components/entity-actions";
import { EntityKeyCopy } from "@/components/entity-key";
import { EntityIcon } from "@/components/entity-icon";
import { IconPicker } from "@/components/icon-picker";
import { RightSidebar } from "@/components/right-sidebar";
import { TrashEntityDialog } from "@/components/trash-entity-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { restoreEntity, updateEntity } from "@/lib/api/entities";
import type { Entity } from "@/lib/api/types";
import { labelForType } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

export function EntityDetailLayout({
  entity,
  headerExtra,
  exportable = false,
  bodyOverlay,
  children,
}: {
  entity: Entity;
  /// Adds the Markdown export actions; only page entities (Notes, Jots) render markdown.
  exportable?: boolean;
  /// Small, optional content rendered after the title — e.g. the Semester page's "Current" badge. Nothing else in the
  /// header varies per entity type (Course page convention).
  headerExtra?: React.ReactNode;
  /// Floats over the scrolling body, e.g. a page's section navigator. Gets the
  /// body's scroll container, since the body scrolls rather than the window.
  bodyOverlay?: (scrollContainer: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const setView = useNavStore((s) => s.setView);
  const [title, setTitle] = useState(entity.title);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isDeleted = !!entity.deletedAt;

  useEffect(() => setTitle(entity.title), [entity.id, entity.title]);
  // A fresh page opens with an empty title, so land the cursor there to type. Only on
  // open (keyed by id), never again while the user is typing into the body.
  useEffect(() => {
    if (!entity.title.trim() && !entity.deletedAt) titleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

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
  const restore = useMutation({
    mutationFn: () => restoreEntity(entity.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
  });
  const pinStatus = useActionStatus(togglePin);
  const restoreStatus = statusOf(restore);
  const renameFailed = rename.isError;
  const iconFailed = setIcon.isError;

  const actions = (className?: string) => (
    <EntityActions
      entity={entity}
      exportable={exportable}
      pin={{
        status: pinStatus,
        toggle: async () => {
          await togglePin.mutateAsync();
        },
      }}
      onTrash={() => setTrashConfirmOpen(true)}
      className={className}
    />
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {isDeleted && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="flex items-center gap-1.5">
            <IconTrashFilled size={14} />
            This {labelForType(entity.type)} is in Trash. All fields are read-only until restored.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => !restore.isPending && restore.mutate()}
          >
            <StatusIcon status={restoreStatus} idle={<IconRestore size={14} />} />
            {restoreStatus === "error" ? "Couldn't restore, try again" : "Restore"}
          </Button>
          <StatusAnnouncer message={restoreStatus === "error" ? "Couldn't restore" : null} />
        </div>
      )}
      <div
        className={`flex min-h-0 min-w-0 flex-1 ${isDeleted ? "opacity-50" : ""}`}
        inert={isDeleted || undefined}
      >
        {/* Clipped so a floating `bodyOverlay` can never make the page itself scroll. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
          <div
            className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2"
            {...entityTarget(entity)}
          >
            <IconPicker
              value={entity.icon}
              onChange={(icon) => setIcon.mutate(icon)}
              trigger={
                <button
                  type="button"
                  title={iconFailed ? "Couldn't change icon, try again" : "Change icon"}
                  className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
                >
                  <StatusIcon
                    status={iconFailed ? "error" : "idle"}
                    size={17}
                    idle={
                      <EntityIcon
                        entity={entity}
                        size={17}
                        className="shrink-0 text-muted-foreground"
                      />
                    }
                  />
                </button>
              }
            />
            <EntityKeyCopy entityKey={entity.key} />
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== entity.title && rename.mutate(title.trim())}
              onKeyDown={(e) => {
                // Title first, content right after: Enter hands the cursor to the body.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                const body = bodyRef.current?.querySelector<HTMLElement>(
                  "[contenteditable='true']",
                );
                if (!body) return;
                e.preventDefault();
                body.focus();
              }}
              placeholder={`Untitled ${labelForType(entity.type)}`}
              disabled={isDeleted}
              aria-invalid={renameFailed || undefined}
              className="min-w-0 flex-1 truncate bg-transparent font-heading text-base font-medium outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
            {renameFailed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="flex shrink-0"
                    aria-label="Couldn't rename, leave the title to retry"
                  >
                    <StatusIcon status="error" idle={null} size={15} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Couldn't rename, leave the title to retry</TooltipContent>
              </Tooltip>
            )}
            <StatusAnnouncer
              message={
                renameFailed ? "Couldn't rename" : iconFailed ? "Couldn't change icon" : null
              }
            />
            {headerExtra}
            {/* The right sidebar hosts these at `lg` and up; below that it's hidden. */}
            {actions("lg:hidden")}
          </div>
          <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            {children}
          </div>
          {bodyOverlay?.(bodyRef)}
        </div>
        <RightSidebar entity={entity} actions={actions} />
      </div>

      <TrashEntityDialog
        entity={entity}
        open={trashConfirmOpen}
        onOpenChange={setTrashConfirmOpen}
        onTrashed={() => setView({ kind: "dashboard" })}
      />
    </div>
  );
}
