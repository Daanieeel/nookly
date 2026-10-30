import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { findCurrentSession } from "#/features/sessions/next-session.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessionsAll } from "#/lib/api/sessions.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { CreateAssignmentDialog } from "./AssignmentsListView";

/// The Session running right now and its Course, when it has one.
interface RunningSession {
  session: Entity;
  course: Entity | null;
}

async function findRunningSession(queryClient: QueryClient): Promise<RunningSession | null> {
  const sessions = await queryClient.fetchQuery({
    queryKey: qk.sessions.all,
    queryFn: listSessionsAll,
    staleTime: 10_000,
  });
  const current = findCurrentSession(sessions, new Date());
  if (!current) return null;
  const links = await listRelationships(current.entity.id, "from");
  const courseId = links.find((r) => r.relationshipType === "session-course")?.toEntityId;
  const course = courseId ? await getEntity(courseId).catch(() => null) : null;
  return { session: current.entity, course };
}

/// The New assignment dialog from anywhere (`quickAssignment`). During a session it starts in
/// that session's Course and links the assignment to the session; otherwise it opens as the
/// Assignments page does. The new assignment opens in a background tab, so the user stays put. Mounted once at the app root.
export function QuickAssignmentDialog() {
  const queryClient = useQueryClient();
  const open = useNavStore((s) => s.newAssignmentOpen);
  const setOpen = useNavStore((s) => s.setNewAssignmentOpen);
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  // `undefined` until the lookup for this opening is done, so the Course never flickers in.
  const [running, setRunning] = useState<RunningSession | null | undefined>();

  useAppHotkey("quickAssignment", () => setOpen(true));

  useEffect(() => {
    if (!open) {
      setRunning(undefined);
      return;
    }
    let current = true;
    findRunningSession(queryClient)
      .catch(() => null)
      .then((found) => {
        if (current) setRunning(found);
      });
    return () => {
      current = false;
    };
  }, [open, queryClient]);

  const spaceId =
    running?.session.spaceId ?? spaces.find((s) => s.id === activeSpaceId)?.id ?? spaces[0]?.id;
  if (!spaceId) return null;
  return (
    <CreateAssignmentDialog
      spaceId={spaceId}
      spaces={spaces}
      open={open && running !== undefined}
      onOpenChange={setOpen}
      initialCourse={running?.course ?? null}
      session={running?.session ?? null}
      openInBackground
    />
  );
}
