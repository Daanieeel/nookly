import {
  type CalendarEntryInput,
  getCalendarEntry,
  setCalendarEntryCancelled,
  updateCalendarEntry,
} from "@nookly/shared/data";
import { IconCalendarEvent, IconClock, IconMapPin, IconSun } from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { ChoiceProperty, DayProperty, InfoRow, TextRow } from "../ui/property-rows.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

/// A Calendar entry: its description in the page; its day, times and place as rows of the
/// details, each saved as it changes. An entry of a series changes alone; the series
/// itself is edited on the computer.
export function CalendarEntryDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const db = useDb();
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const { data: item } = useQuery({
    queryKey: [...keys.entity(id), "calendar"],
    queryFn: () => getCalendarEntry(db, id),
  });
  const save = useLocalWrite((d, input: CalendarEntryInput) => updateCalendarEntry(d, id, input));
  const cancel = useLocalWrite((d, cancelled: boolean) =>
    setCalendarEntryCancelled(d, id, cancelled),
  );
  const [text, setText] = useState("");
  const stored = item?.description;
  useEffect(() => setText(stored ?? ""), [stored]);
  if (!item) return null;
  const change = (patch: Partial<CalendarEntryInput>) =>
    save.mutate({
      title: item.title,
      date: item.date,
      endDate: item.endDate,
      startTime: item.startTime,
      endTime: item.endTime,
      allDay: item.allDay,
      location: item.location,
      description: item.description ?? null,
      ...patch,
    });
  return (
    <>
      <MainPart>
        <View className="gap-3">
          {item.templateId ? (
            <Text tone="muted">
              Part of a repeating series. A change here is for this one only; edit the whole series
              on your computer.
            </Text>
          ) : null}
          {item.cancelled ? <Text tone="caution">Cancelled</Text> : null}
          <Field
            label="Description"
            multiline
            editable={!readOnly}
            placeholder="Type / for commands, or just start writing…"
            value={text}
            onChangeText={setText}
            onEndEditing={() => text !== (item.description ?? "") && change({ description: text })}
          />
        </View>
      </MainPart>
      <DetailsPart>
        <View className="gap-3">
          <PropertyList>
            <DayProperty
              name="date"
              icon={<IconCalendarEvent size={20} color={muted} />}
              label="Date"
              clearable={false}
              value={item.date}
              readOnly={readOnly}
              onChange={(date) => date && change({ date })}
            />
            <DayProperty
              name="last"
              icon={<IconCalendarEvent size={20} color={muted} />}
              label="Last day"
              placeholder="Only this day"
              value={item.endDate ?? null}
              readOnly={readOnly}
              onChange={(endDate) => change({ endDate })}
            />
            <ChoiceProperty
              name="allDay"
              icon={<IconSun size={20} color={muted} />}
              label="All day"
              value={item.allDay ? "yes" : "no"}
              readOnly={readOnly}
              options={[
                { id: "yes", label: "Yes" },
                { id: "no", label: "No" },
              ]}
              onChange={(value) => change({ allDay: value === "yes" })}
            />
            {item.allDay ? (
              <InfoRow icon={<IconClock size={20} color={muted} />} label="Time" value="All day" />
            ) : (
              <DayProperty
                name="starts"
                icon={<IconClock size={20} color={muted} />}
                label="Starts"
                mode="time"
                value={item.startTime}
                readOnly={readOnly}
                onChange={(startTime) => change({ startTime })}
              />
            )}
            {item.allDay ? null : (
              <DayProperty
                name="ends"
                icon={<IconClock size={20} color={muted} />}
                label="Ends"
                mode="time"
                value={item.endTime}
                readOnly={readOnly}
                onChange={(endTime) => change({ endTime })}
              />
            )}
            <TextRow
              icon={<IconMapPin size={20} color={muted} />}
              label="Where"
              value={item.location}
              readOnly={readOnly}
              placeholder="Room 2"
              onSave={(location) => change({ location })}
            />
            <InfoRow
              icon={<IconCalendarEvent size={20} color={muted} />}
              label="Repeats"
              value={item.templateId ? "A series" : "Never"}
            />
          </PropertyList>
          {save.error ? <Text tone="destructive">{save.error.message}</Text> : null}
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
      </DetailsPart>
    </>
  );
}
