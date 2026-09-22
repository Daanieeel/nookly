import { IconPencil, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import { deleteRelationship, listRelationships } from "@/lib/api/relationships";
import { setCourseSemester } from "@/lib/api/courses";
import type { Entity } from "@/lib/api/types";
import { EntityRow } from "@/features/relationships/EntityRow";

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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Semester</h3>
        {link && (
          <EntityPickerPopover
            spaceId={course.spaceId}
            typeFilter="semester"
            exclude={course.id}
            trigger={
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Change semester"
              >
                <IconPencil size={13} />
              </button>
            }
            onSelect={(semester) => assign.mutate(semester.id)}
          />
        )}
      </div>

      {!link ? (
        <EntityPickerPopover
          spaceId={course.spaceId}
          typeFilter="semester"
          exclude={course.id}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start">
              Assign to a semester…
            </Button>
          }
          onSelect={(semester) => assign.mutate(semester.id)}
        />
      ) : (
        <div className="group flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <EntityRow entityId={link.toEntityId} currentSpaceId={course.spaceId} />
          </div>
          <button
            type="button"
            onClick={() => unassign.mutate(link.id)}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
            aria-label="Unassign semester"
          >
            <IconX size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
