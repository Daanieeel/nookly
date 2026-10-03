import { IconCalendarEvent } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { listCalendarEntries } from "#/lib/api/calendarEntries.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { buildColumns } from "../sessions/calendar/calendar-model";
import { MonthGrid } from "../sessions/calendar/MonthGrid";
import { TimeGrid } from "../sessions/calendar/TimeGrid";
import { CalendarPageHeader, useCalendarPage } from "../calendar/calendar-page";
import { QuickCreateCalendarEntryDialog } from "./calendar/QuickCreateCalendarEntryDialog";
import { qk } from "#/lib/query-keys.ts";

/// The per-Space Calendar module page: same Outlook-style calendar as
/// Sessions (Day/Work week/Week/Month, drag-to-create), but entirely separate
/// data — only this Space's calendar entries show here, never Sessions, and
/// there is no external-calendar overlay (that stays a Sessions-view/
/// unified-Calendar-page thing). See `docs/03-modules/sessions-timetable.md`
/// for the shared pattern.
export function CalendarEntriesListView({ spaceId }: { spaceId: string }) {
  const page = useCalendarPage(STORAGE_KEYS.calendarModuleView);
  const { view, anchor, days, draft, setDraft, highlightIds, setHighlightIds, pickDay } = page;

  const { data: entries = [] } = useQuery({
    queryKey: qk.calendarEntries.bySpace(spaceId),
    queryFn: () => listCalendarEntries(spaceId),
  });
  // This Space's Sessions, shown here too but as secondary context next to
  // Calendar entries (see `SessionsListView`'s reciprocal fetch of entries).
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
  });
  // This Space's own accent color, so entries tint to it instead of the
  // fixed `--accent-purple` default (see `CalendarEntryBlock`'s `accentColor`).
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceAccent = spaces.find((s) => s.id === spaceId)?.color;
  const spaceColor = useCallback(() => spaceAccent, [spaceAccent]);

  const columns = buildColumns(days, sessions, [], entries);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Calendar Entry",
        create: page.startCreate,
      })}
    >
      <CalendarPageHeader
        page={page}
        icon={IconCalendarEvent}
        title="Calendar"
        createLabel="New entry"
        createTooltip="Create a calendar entry"
      />

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          columns={columns}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          spaceColor={spaceColor}
          secondaryKind="session"
        />
      ) : (
        <TimeGrid
          key={view}
          columns={columns}
          selection={draft}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          slotCreateNoun="Calendar Entry"
          spaceColor={spaceColor}
          secondaryKind="session"
          allowMultiDay
        />
      )}

      <QuickCreateCalendarEntryDialog
        spaceId={spaceId}
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onCreated={(ids) => setHighlightIds(new Set(ids))}
      />
    </div>
  );
}
