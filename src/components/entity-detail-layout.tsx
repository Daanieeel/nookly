import {
  IconCalendarStats,
  IconClipboardList,
  IconRestore,
  IconSchool,
  IconTrashFilled,
  IconWriting,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  useActionStatus,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { EntityActions } from "@/components/entity-actions";
import { EntityKeyCopy } from "@/components/entity-key";
import { EntityIcon } from "@/components/entity-icon";
import { EntityMention } from "@/components/entity-mention";
import { IconPicker } from "@/components/icon-picker";
import { RightSidebar } from "@/components/right-sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { restoreEntity, softDeleteEntity, updateEntity } from "@/lib/api/entities";
import { listRelationships } from "@/lib/api/relationships";
import type { Entity, Relationship } from "@/lib/api/types";
import { displayTitle, labelForType } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

interface TrashStat {
  icon: TablerIcon;
  count: number;
  label: string;
}

/// Exact counts of what stays linked to (not deleted from, just rendered
/// trashed on until restored, per the entity model's soft-delete rule) each
/// trashable type — the confirmation dialog states these as stat boxes
/// instead of a vague prose paragraph (confirmation-dialogs skill).
function trashStats(type: string, relationships: Relationship[]): TrashStat[] {
  const countOf = (relationshipType: string) =>
    relationships.filter((r) => r.relationshipType === relationshipType).length;

  if (type === "course") {
    return [
      { icon: IconCalendarStats, count: countOf("session-course"), label: "Sessions" },
      { icon: IconWriting, count: countOf("exam-course"), label: "Exams" },
      { icon: IconClipboardList, count: countOf("assignment-course"), label: "Assignments" },
    ].filter((s) => s.count > 0);
  }
  if (type === "semester") {
    return [{ icon: IconSchool, count: countOf("course-semester"), label: "Courses" }].filter(
      (s) => s.count > 0,
    );
  }
  return [];
}

export function EntityDetailLayout({
  entity,
  headerExtra,
  exportable = false,
  children,
}: {
  entity: Entity;
  /// Adds the Markdown export actions; only page entities (Notes, Jots) render markdown.
  exportable?: boolean;
  /// Small, optional content rendered after the title — e.g. the Semester page's "Current" badge. Nothing else in the
  /// header varies per entity type (Course page convention).
  headerExtra?: React.ReactNode;
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
  const trash = useMutation({ mutationFn: () => softDeleteEntity(entity.id) });
  useCloseAfterSuccess(trash, () => {
    setTrashConfirmOpen(false);
    setView({ kind: "dashboard" });
  });
  const trashStatus = statusOf(trash);
  const restore = useMutation({
    mutationFn: () => restoreEntity(entity.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
  });
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", entity.id],
    queryFn: () => listRelationships(entity.id, "both"),
    enabled: trashConfirmOpen,
  });
  const stats = trashStats(entity.type, relationships);
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
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
        </div>
        <RightSidebar entity={entity} actions={actions} />
      </div>

      <AlertDialog
        open={trashConfirmOpen}
        onOpenChange={(open) => {
          setTrashConfirmOpen(open);
          // A failed attempt shouldn't greet the next opening of the dialog.
          if (!open && !trash.isSuccess) trash.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
              Move
              <EntityMention
                icon={<EntityIcon entity={entity} size={13} />}
                label={displayTitle(entity)}
              />
              to Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from lists and views. Restore it from Trash any time; nothing is deleted
              permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {stats.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-4 rounded-lg border border-border px-4 py-2.5">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex items-center gap-1.5 text-sm">
                    <stat.icon size={14} className="text-muted-foreground" />
                    <span className="font-medium">{stat.count}</span>
                    <span className="text-muted-foreground">{stat.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                They stay linked, shown as trashed until this is restored.
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (trashStatus === "idle" || trashStatus === "error") trash.mutate();
              }}
            >
              <StatusIcon status={trashStatus} idle={null} />
              {trashStatus === "success"
                ? "Moved to Trash"
                : trashStatus === "error"
                  ? "Couldn't move to Trash, try again"
                  : "Move to Trash"}
            </AlertDialogAction>
            <StatusAnnouncer
              message={
                trashStatus === "success"
                  ? "Moved to Trash"
                  : trashStatus === "error"
                    ? "Couldn't move to Trash"
                    : null
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
