import { agenda, type CalendarEntryInput, updateCalendarEntry } from "@nookly/shared/data";
import { useQuery } from "@tanstack/react-query";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { CalendarEntryForm } from "./CalendarEntryForm.tsx";

/// A Calendar entry's day, times and place, edited in place.
export function CalendarEntryDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const db = useDb();
  const { data: item } = useQuery({
    queryKey: [...keys.entity(id), "calendar"],
    queryFn: async () =>
      (await agenda(db, "0000-01-01", "9999-12-31")).find((i) => i.id === id) ?? null,
  });
  const save = useLocalWrite((d, input: CalendarEntryInput) => updateCalendarEntry(d, id, input));
  if (!item) return null;
  return (
    <CalendarEntryForm
      initial={{
        title: item.title,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        allDay: item.allDay,
        location: item.location,
      }}
      showTitle={false}
      readOnly={readOnly}
      submitLabel="Save"
      status={save}
      onSubmit={(input) => save.mutate({ ...input, title: item.title })}
    />
  );
}
