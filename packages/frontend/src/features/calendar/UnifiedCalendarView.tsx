import { IconCalendarWeek } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { listSpaces } from "#/lib/api/spaces.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { CalendarPageHeader, useCalendarPage } from "./calendar-page";
import { MonthGrid } from "../sessions/calendar/MonthGrid";
import { TimeGrid } from "../sessions/calendar/TimeGrid";
import { useCrossSpaceColumns } from "../sessions/calendar/use-cross-space-columns";
import { QuickCreateCalendarEntryDialog } from "../calendar-entries/calendar/QuickCreateCalendarEntryDialog";
import { qk } from "#/lib/query-keys.ts";

/// The fifth cross-Space exception (`docs/04-navigation-spaces.md`): one
/// unified, space-neutral calendar layering the external overlay (bottom, read
/// only), every Space's Sessions, and every Space's Calendar entries (both
/// editable in place, via the same popovers their own per-Space calendars
/// use), each tinted by its origin Space's own accent color rather than any
/// single "active" Space's. Creating a Session still only happens on its own
/// Space's calendar (a Session needs a Course, and there's no single "current"
/// Space here to scope one to) — but a calendar entry can be created directly
/// from here too, the same drag/right-click surface as its own Space's
/// calendar, just with an added Space picker in the dialog.
export function UnifiedCalendarView() {
  const page = useCalendarPage(STORAGE_KEYS.calendarView);
  const { view, anchor, days, draft, setDraft, highlightIds, setHighlightIds, pickDay } = page;

  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceColorById = useMemo(() => new Map(spaces.map((s) => [s.id, s.color])), [spaces]);
  const spaceColor = useCallback(
    (spaceId: string) => spaceColorById.get(spaceId),
    [spaceColorById],
  );

  const columns = useCrossSpaceColumns(days);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CalendarPageHeader
        page={page}
        icon={IconCalendarWeek}
        title="Calendar"
        createLabel="New entry"
        createTooltip="Create a calendar entry"
        createKbd={false}
      />

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          columns={columns}
          highlightIds={highlightIds}
          onSelect={setDraft}
          onPickDay={pickDay}
          spaceColor={spaceColor}
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
          allowMultiDay
        />
      )}

      <QuickCreateCalendarEntryDialog
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onCreated={(ids) => setHighlightIds(new Set(ids))}
      />
    </div>
  );
}
