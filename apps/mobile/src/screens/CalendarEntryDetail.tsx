import {
  type CalendarEntryInput,
  getCalendarEntry,
  setCalendarEntryCancelled,
  updateCalendarEntry,
} from "@nookly/shared/data";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { CalendarEntryForm } from "./CalendarEntryForm.tsx";

/// A Calendar entry's day, times and place, edited in place. An entry of a series
/// changes alone; the series itself is edited on the computer.
export function CalendarEntryDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const db = useDb();
  const { data: item } = useQuery({
    queryKey: [...keys.entity(id), "calendar"],
    queryFn: () => getCalendarEntry(db, id),
  });
  const save = useLocalWrite((d, input: CalendarEntryInput) => updateCalendarEntry(d, id, input));
  const cancel = useLocalWrite((d, cancelled: boolean) =>
    setCalendarEntryCancelled(d, id, cancelled),
  );
  if (!item) return null;
  return (
    <View className="gap-4">
      {item.templateId ? (
        <Text tone="muted">
          Part of a repeating series. A change here is for this one only; edit the whole series on
          your computer.
        </Text>
      ) : null}
      {item.cancelled ? <Text tone="caution">Cancelled</Text> : null}
      <CalendarEntryForm
        key={`${item.date}-${item.endDate}-${item.startTime}-${item.endTime}-${item.allDay}-${item.location}`}
        initial={{
          title: item.title,
          date: item.date,
          endDate: item.endDate,
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
      {!readOnly ? (
        <View className="items-start">
          <Button
            label={item.cancelled ? "Bring Back" : "Cancel This One"}
            variant="ghost"
            status={statusOf(cancel)}
            errorLabel="Couldn't change it"
            onPress={() => cancel.mutate(!item.cancelled)}
          />
        </View>
      ) : null}
    </View>
  );
}
