import { IconLink, IconPlus } from "@tabler/icons-react";
import { type Query, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusButtonContent, statusOf } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import {
  createRelationship,
  deleteRelationship,
  listRelationships,
  listRelationshipTypes,
} from "@/lib/api/relationships";
import type { Entity } from "@/lib/api/types";
import { EntityRow } from "./EntityRow";
import { RelatePickerPopover } from "./RelatePickerPopover";
import { RemoveLinkButton } from "./RemoveLinkButton";
import { SidebarSection } from "./SidebarSection";

/// The Jots list shows each row's linked pages and Session, from any Space's list.
function isJotSummaries(query: Query): boolean {
  return query.queryKey[2] === "jot-summaries";
}

/// Right sidebar, section 1 of 4 (§1.5) — every relationship except attachments,
/// which the Attachments panel below covers on its own.
export function RelationshipsPanel({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", entity.id],
    queryFn: () => listRelationships(entity.id, "both"),
  });
  const { data: types = [] } = useQuery({
    queryKey: ["relationship-types"],
    queryFn: listRelationshipTypes,
  });

  const create = useMutation({
    mutationFn: (vars: { toEntityId: string; relationshipType: string }) =>
      createRelationship(entity.id, vars.toEntityId, vars.relationshipType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships", entity.id] });
      // A Jot counts as refined once linked to a Note through this same generic
      // relationship system (§ sidebar badges), so recount on every link change.
      queryClient.invalidateQueries({ queryKey: ["unrefined-jots"] });
      queryClient.invalidateQueries({ predicate: isJotSummaries });
    },
  });
  // The new row appearing is the confirmation, so the trigger shows no success state.
  const createStatus = create.isSuccess ? "idle" : statusOf(create);

  // `course-notes` is structural and points at an entity that must stay invisible
  // outside the Course page (§ course sub-dashboard) — never list it here, and
  // never offer it as a linkable type from the "+" picker either.
  // `semester-notes` is a real `note` entity but is already rendered inline at
  // the top of the Semester page (PLAN §2) — hide the relationship row too so
  // it isn't shown twice.
  // `course-semester` gets its own bespoke section (`CourseSemesterPanel`) on a
  // Course's own page, so hide it here only for Course entities — a Semester's
  // page still lists its Courses through this generic panel as normal.
  const HIDDEN_TYPES = new Set([
    "attached-file",
    "course-notes",
    "semester-notes",
    ...(entity.type === "course" ? ["course-semester"] : []),
  ]);
  const visible = relationships.filter((r) => !HIDDEN_TYPES.has(r.relationshipType));
  const pickableTypes = types.filter((t) => !HIDDEN_TYPES.has(t.name));

  return (
    <SidebarSection icon={<IconLink size={14} />} title="Relationships" count={visible.length}>
      <RelatePickerPopover
        spaceId={entity.spaceId}
        exclude={entity.id}
        types={pickableTypes}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-1.5 px-2 font-normal [&_svg]:size-3.5"
          >
            <StatusButtonContent
              status={createStatus}
              icon={<IconPlus size={14} />}
              label="Relate to…"
              errorLabel="Couldn't link, try again"
            />
          </Button>
        }
        onSelect={(target, relationshipType) =>
          create.mutate({ toEntityId: target.id, relationshipType })
        }
      />

      <div className="flex flex-col gap-0.5">
        {visible.map((r) => {
          const isFrom = r.fromEntityId === entity.id;
          const otherId = isFrom ? r.toEntityId : r.fromEntityId;
          const def = types.find((t) => t.name === r.relationshipType);
          const label = isFrom ? r.relationshipType : (def?.inverseLabel ?? r.relationshipType);
          return (
            <div key={r.id} className="group flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <EntityRow entityId={otherId} currentSpaceId={entity.spaceId} label={label} />
              </div>
              <RemoveLinkButton
                label="Remove relationship"
                errorLabel="Couldn't remove relationship, try again"
                onRemove={async () => {
                  await deleteRelationship(r.id);
                  await Promise.all([
                    queryClient.invalidateQueries({
                      queryKey: ["relationships", entity.id],
                    }),
                    queryClient.invalidateQueries({
                      queryKey: ["unrefined-jots"],
                    }),
                    queryClient.invalidateQueries({ predicate: isJotSummaries }),
                  ]);
                }}
              />
            </div>
          );
        })}
      </div>
    </SidebarSection>
  );
}
