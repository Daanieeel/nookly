import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useMemo } from "react";
import { listCalendarEntriesAll } from "#/lib/api/calendarEntries.ts";
import { listExamsAllSpaces } from "#/lib/api/exams.ts";
import { listExternalEvents } from "#/lib/api/externalCalendars.ts";
import { listSessionsAll } from "#/lib/api/sessions.ts";
import { qk } from "#/lib/query-keys.ts";
import { buildColumns, dayKey } from "./calendar-model";

/// The time grid columns for `days` with everything on them: every Space's Sessions,
/// Calendar entries and Exams plus the external overlay. Shared by the unified Calendar page and
/// the Session cut-out, so both show the same week the same way.
export function useCrossSpaceColumns(days: Date[]) {
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.all,
    queryFn: listSessionsAll,
  });
  const { data: calendarEntries = [] } = useQuery({
    queryKey: qk.calendarEntries.all,
    queryFn: listCalendarEntriesAll,
  });
  const { data: exams = [] } = useQuery({ queryKey: qk.exams.all, queryFn: listExamsAllSpaces });
  const fromKey = dayKey(addDays(days[0], -1));
  const toKey = dayKey(addDays(days[days.length - 1], 1));
  const { data: externalEvents = [] } = useQuery({
    queryKey: qk.externalCalendars.eventsBetween(fromKey, toKey),
    queryFn: () => listExternalEvents(fromKey, toKey),
    placeholderData: keepPreviousData,
  });
  return useMemo(
    () => buildColumns(days, sessions, externalEvents, calendarEntries, exams),
    [days, sessions, externalEvents, calendarEntries, exams],
  );
}
