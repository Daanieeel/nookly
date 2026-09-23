import {
  IconCalendarStats,
  IconClipboardList,
  IconSchool,
  IconWriting,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { EntityIcon } from "@/components/entity-icon";
import { EntityMention } from "@/components/entity-mention";
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
import { softDeleteEntity } from "@/lib/api/entities";
import { listRelationships } from "@/lib/api/relationships";
import type { Entity, Relationship } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

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

/// The Move to Trash confirmation, shared by the page header's actions and the
/// context menu. Stays open while the soft delete runs; `onTrashed` follows up
/// (leave the page) once it has landed, as the dialog closes.
export function TrashEntityDialog({
  entity,
  open,
  onOpenChange,
  onTrashed,
}: {
  entity: Entity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTrashed: () => void;
}) {
  const trash = useMutation({ mutationFn: () => softDeleteEntity(entity.id) });
  useCloseAfterSuccess(trash, () => {
    onOpenChange(false);
    onTrashed();
  });
  const trashStatus = statusOf(trash);
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", entity.id],
    queryFn: () => listRelationships(entity.id, "both"),
    enabled: open,
  });
  const stats = trashStats(entity.type, relationships);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // A failed attempt shouldn't greet the next opening of the dialog.
        if (!next && !trash.isSuccess) trash.reset();
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
  );
}
