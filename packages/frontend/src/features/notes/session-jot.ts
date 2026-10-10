import type { QueryClient } from "@tanstack/react-query";
import { notify } from "#/components/notify.tsx";
import { sessionPageTitle } from "#/features/sessions/calendar/SessionPopover.tsx";
import { findCurrentSession } from "#/features/sessions/next-session.ts";
import { createSessionPage, getSessionPages, listSessionsAll } from "#/lib/api/sessions.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// The session Jot shortcut: opens the Jot of the session running right now, creating
/// it first when the session has none. With no session running it opens nothing and says
/// so, rather than falling back to a loose Jot the user did not ask for.
export async function openCurrentSessionJot(queryClient: QueryClient): Promise<void> {
  try {
    const sessions = await queryClient.fetchQuery({
      queryKey: qk.sessions.all,
      queryFn: listSessionsAll,
      staleTime: 10_000,
    });
    const current = findCurrentSession(sessions, new Date());
    if (!current) {
      notify.error("No session is running right now", {
        description:
          "Session jots start while a session is running. Open a session from the calendar to jot into it.",
      });
      return;
    }
    const pages = await getSessionPages(current.entity.id);
    const jot =
      pages.jot ?? (await createSessionPage(current.entity.id, "jot", sessionPageTitle(current)));
    void queryClient.invalidateQueries({ queryKey: qk.sessions.pages(current.entity.id) });
    void queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(jot.spaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.jots.unrefined });
    useNavStore.getState().openEntity(jot.id, jot.spaceId);
  } catch {
    notify.error("Couldn't open the session jot", { description: "Try again." });
  }
}
