import { IconCalendarEvent, IconMapPin, IconSchool } from "@tabler/icons-react-native";
import { View } from "react-native";
import { isFeedItem } from "../moodle/calendar.ts";
import { useMoodleCalendar } from "../moodle/queries.ts";
import { EmptyState } from "../ui/kit/States.tsx";
import { Row, Section } from "../ui/Row.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { Text } from "../ui/Text.tsx";
import { dayLabel, localDay } from "./dates.ts";

/// Where an item of the calendar opens: Nookly's own on its page, one from Moodle's
/// calendar in its read only details.
export function itemHref(id: string): string {
  return isFeedItem({ id }) ? `/calendar-event?id=${encodeURIComponent(id)}` : `/entity/${id}`;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/// An event from Moodle's calendar: what and when, never editable here, as the desktop's
/// popover over an overlay event.
export function ExternalEventScreen({ id }: { id: string }) {
  const { data: feed } = useMoodleCalendar();
  const event = feed?.events.find((e) => e.id === id);
  if (!event) {
    return (
      <EmptyState
        glyph={IconCalendarEvent}
        title="This event is gone"
        message="Moodle's calendar no longer lists it."
      />
    );
  }
  const start = event.allDay ? event.start : localDay(new Date(event.start));
  const when = event.allDay
    ? `${dayLabel(start)}, all day`
    : event.end === event.start
      ? `${dayLabel(start)} at ${clock(event.start)}`
      : `${dayLabel(start)}, ${clock(event.start)} to ${clock(event.end)}`;
  return (
    <View className="gap-4">
      <Text variant="heading" selectable>
        {event.title || "Busy"}
      </Text>
      <Section>
        <Row title={when} icon={<IconBadge glyph={IconCalendarEvent} tint="red" />} />
        {event.location ? (
          <Row title={event.location} icon={<IconBadge glyph={IconMapPin} tint="gray" />} />
        ) : null}
        <Row
          title="From Moodle"
          subtitle={feed?.site}
          icon={<IconBadge glyph={IconSchool} tint="blue" />}
        />
      </Section>
      <Text variant="small" tone="muted">
        Nookly only reads your Moodle calendar. Change this event on Moodle.
      </Text>
    </View>
  );
}
