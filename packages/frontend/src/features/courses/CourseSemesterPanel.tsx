import { IconCalendarStats, IconPencil, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { deleteRelationship, listRelationships } from "#/lib/api/relationships.ts";
import { setCourseSemester } from "#/lib/api/courses.ts";
import type { Entity } from "#/lib/api/types.ts";
import { EntityRow } from "#/features/relationships/EntityRow.tsx";
import { SidebarSection } from "#/features/relationships/SidebarSection.tsx";

/// Course page, right sidebar — bespoke Semester-assignment section. A Course
/// belongs to at most one Semester at a time (`course-semester` relationship,
/// §5.4/5.5, `OneToPerFrom` — a Semester itself has unrestricted Courses),
/// pulled out of the generic Relationships list into its own purpose-built
/// picker rather than a bare relationship row, per the bespoke-UI pillar.
/// `RelationshipsPanel` hides `course-semester` for Course entities so it
/// isn't shown twice; a Semester's own page still lists its Courses there
/// normally.
export function CourseSemesterPanel({ course }: { course: Entity }) {
  const queryClient = useQueryClient();

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", course.id],
    queryFn: () => listRelationships(course.id, "both"),
  });
  // At most one, enforced at the data layer — `find` rather than `filter`.
  const link = relationships.find(
    (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
  );

  const assign = useMutation({
    mutationFn: (semesterId: string) => setCourseSemester(course.id, semesterId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", course.id] }),
  });
  const unassign = useMutation({
    mutationFn: (relationshipId: string) => deleteRelationship(relationshipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", course.id] }),
  });
  const assignStatus = useActionStatus(assign);
  const unassignStatus = statusOf(unassign);
  const changeLabel =
    assignStatus === "error" ? "Couldn't change semester, try again" : "Change semester";
  const unassignLabel =
    unassignStatus === "error" ? "Couldn't unassign, try again" : "Unassign semester";

  return (
    <SidebarSection
      icon={<IconCalendarStats size={14} />}
      title="Semester"
      action={
        link && (
          <Tooltip>
            <EntityPickerPopover
              spaceId={course.spaceId}
              typeFilter="semester"
              exclude={course.id}
              trigger={
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={changeLabel}
                  >
                    <StatusIcon status={assignStatus} idle={<IconPencil size={13} />} size={13} />
                  </button>
                </TooltipTrigger>
              }
              onSelect={(semester) => !assign.isPending && assign.mutate(semester.id)}
            />
            <TooltipContent>{changeLabel}</TooltipContent>
          </Tooltip>
        )
      }
    >
      {!link ? (
        <EntityPickerPopover
          spaceId={course.spaceId}
          typeFilter="semester"
          exclude={course.id}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <StatusButtonContent
                status={assignStatus}
                label="Assign to a semester…"
                errorLabel="Couldn't assign, try again"
              />
            </Button>
          }
          onSelect={(semester) => !assign.isPending && assign.mutate(semester.id)}
        />
      ) : (
        <div className="group flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <EntityRow entityId={link.toEntityId} currentSpaceId={course.spaceId} />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => !unassign.isPending && unassign.mutate(link.id)}
                className={cn(
                  "shrink-0 rounded p-1 text-muted-foreground hover:bg-accent group-hover:opacity-100",
                  unassignStatus === "idle" ? "opacity-0" : "opacity-100",
                )}
                aria-label={unassignLabel}
              >
                <StatusIcon status={unassignStatus} idle={<IconX size={12} />} size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{unassignLabel}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <StatusAnnouncer
        message={
          assignStatus === "error"
            ? "Couldn't assign semester"
            : unassignStatus === "error"
              ? "Couldn't unassign semester"
              : null
        }
      />
    </SidebarSection>
  );
}
