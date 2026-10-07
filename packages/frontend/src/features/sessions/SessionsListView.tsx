import { IconChalkboard, IconX } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useCallback } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { Badge } from "@nookly/ui/components/badge";
import { listCalendarEntries } from "#/lib/api/calendarEntries.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { listExternalEvents } from "#/lib/api/externalCalendars.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { buildColumns, dayKey } from "./calendar/calendar-model";
import { CalendarPageHeader, useCalendarPage } from "../calendar/calendar-page";
import { MonthGrid } from "./calendar/MonthGrid";
import { QuickCreateSessionDialog } from "./calendar/QuickCreateSessionDialog";
import { TimeGrid } from "./calendar/TimeGrid";
import { qk } from "#/lib/query-keys.ts";

/// The Sessions page is a full calendar, modeled on Outlook: Day, Work week,
/// Week and Month views over the whole page. The calendar is the creation
/// surface: drag across time (or click a day in Month) to start a Session.
/// External calendars show as a read only overlay. See `ExamsListView` for the
/// `filterCourseId` convention.
export function SessionsListView({
  spaceId,
  filterCourseId,
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const page = useCalendarPage(undefined, "session");
  const { view, anchor, days, draft, setDraft, highlightIds, setHighlightIds, pickDay } = page;
  const setNavView = useNavStore((s) => s.setView);

  const { data: allSessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
  });
  const { data: filterCourse } = useQuery({
    queryKey: qk.entity.byId(filterCourseId),
    // SAFETY: the query only runs when `enabled`, i.e. once `filterCourseId` is set.
    queryFn: () => getEntity(filterCourseId as string),
    enabled: Boolean(filterCourseId),
  });
  const { data: courseRelationships = [] } = useQuery({
    queryKey: qk.relationships.of(filterCourseId),
    // SAFETY: the query only runs when `enabled`, i.e. once `filterCourseId` is set.
    queryFn: () => listRelationships(filterCourseId as string, "to"),
    enabled: Boolean(filterCourseId),
  });
  const sessions = filterCourseId
    ? allSessions.filter((s) =>
        courseRelationships.some(
          (r) => r.relationshipType === "session-course" && r.fromEntityId === s.entity.id,
        ),
      )
    : allSessions;
  // This Space's own accent color, so Sessions and Calendar entries tint to
  // it instead of the fixed `--primary`/`--accent-purple` defaults (see
  // `SessionBlock` and `CalendarEntryBlock`'s `accentColor`).
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceAccent = spaces.find((s) => s.id === spaceId)?.color;
  const spaceColor = useCallback(() => spaceAccent, [spaceAccent]);

  // External calendars are a read only overlay, never Sessions. Hidden while the
  // view is narrowed to one Course, since they belong to none. Padded by a day
  // because the cache compares timed events by their UTC date.
  const fromKey = dayKey(addDays(days[0], -1));
  const toKey = dayKey(addDays(days[days.length - 1], 1));
  const { data: externalEvents = [] } = useQuery({
    queryKey: qk.externalCalendars.eventsBetween(fromKey, toKey),
    queryFn: () => listExternalEvents(fromKey, toKey),
    enabled: !filterCourseId,
    placeholderData: keepPreviousData,
  });
  // This Space's Calendar entries, shown here too but as secondary context
  // next to Sessions (see `CalendarEntriesListView`'s reciprocal fetch of
  // Sessions). Hidden while narrowed to one Course, since a calendar entry
  // never has one.
  const { data: calendarEntries = [] } = useQuery({
    queryKey: qk.calendarEntries.bySpace(spaceId),
    queryFn: () => listCalendarEntries(spaceId),
    enabled: !filterCourseId,
  });
  const columns = buildColumns(
    days,
    sessions,
    filterCourseId ? [] : externalEvents,
    filterCourseId ? [] : calendarEntries,
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Session",
        create: page.startCreate,
      })}
    >
      <CalendarPageHeader
        page={page}
        icon={IconChalkboard}
        title="Sessions"
        createLabel="New session"
        createTooltip="Create a session"
        afterNav={
          filterCourseId && filterCourse ? (
            <Badge variant="secondary" className="gap-1 pr-1">
              Filtered by {displayTitle(filterCourse)}
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setNavView({ kind: "module", spaceId, module: "sessions" })}
                className="rounded-full p-0.5 hover:bg-accent-foreground/10"
              >
                <IconX size={11} />
              </button>
            </Badge>
          ) : null
        }
      />

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          columns={columns}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          spaceColor={spaceColor}
          secondaryKind="calendarEntry"
          createKind="session"
        />
      ) : (
        <TimeGrid
          key={view}
          columns={columns}
          selection={draft}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          slotCreateNoun="Session"
          createKind="session"
          spaceColor={spaceColor}
          secondaryKind="calendarEntry"
        />
      )}

      <QuickCreateSessionDialog
        spaceId={spaceId}
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onCreated={(ids) => setHighlightIds(new Set(ids))}
      />
    </div>
  );
}
