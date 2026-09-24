import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type ExternalCalendarStatus, syncExternalCalendars } from "@/lib/api/externalCalendars";

export const EXTERNAL_CALENDAR_STATUS_KEY = ["external-calendars", "status"];
export const EXTERNAL_EVENTS_KEY = ["external-calendars", "events"];

/// How often the overlay refreshes while the app is in the foreground.
const POLL_MS = 15 * 60_000;
const CHECK_MS = 60_000;

/// Fetches every connected provider, then shows the fresh cache. Failures stay
/// on their connection; the overlay keeps its last known events.
export async function syncExternalCalendarsNow(queryClient: QueryClient) {
  const connections = await syncExternalCalendars();
  queryClient.setQueryData<ExternalCalendarStatus>(EXTERNAL_CALENDAR_STATUS_KEY, (old) =>
    old ? { ...old, connections } : old,
  );
  await queryClient.invalidateQueries({ queryKey: EXTERNAL_EVENTS_KEY });
  return connections;
}

/// Polls external calendars while the window is visible, and catches up as
/// soon as it comes back to the foreground. Kept out of React Query so the
/// refetch on external database changes never triggers network syncs.
export function useExternalCalendarSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < POLL_MS) return;
      last = Date.now();
      void syncExternalCalendarsNow(queryClient).catch(() => {});
    };
    run();
    const interval = window.setInterval(run, CHECK_MS);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [queryClient]);
}
