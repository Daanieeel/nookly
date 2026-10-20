import type { AgendaItem } from "@nookly/shared/data";
import { allDayChipLook, blockLook, withAlpha } from "@nookly/shared/calendar-style";
import {
  DAY_MINUTES,
  type Segment,
  blockGeometry,
  layoutLanes,
  segmentsForDay,
} from "@nookly/shared/time-grid";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSetting } from "../data/settings.ts";
import { Text } from "../ui/Text.tsx";
import { useCalendarColors } from "./calendar-colors.ts";
import { localDay } from "./dates.ts";

/// Pixels per hour, and the least a block is drawn tall (a short item stays tappable).
export const HOUR_PX = 52;
const MIN_BLOCK_PX = 22;
const ALL_DAY_ROW_PX = 20;
/// All day rows shown under the day names before the rest fold into "+ n".
const MAX_ALL_DAY = 2;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const DAY_NARROW = ["S", "M", "T", "W", "T", "F", "S"];

function dayParts(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return { date, weekday: date.getDay(), number: d };
}

/// Minutes since midnight now, moving on every minute, for the line that marks the time.
function useNowMinutes(): number {
  const read = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setMinutes(read()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return minutes;
}

/// "9 AM" or "09:00", as the person's time format asks.
function hourLabel(hour: number, twelve: boolean): string {
  if (!twelve) return `${String(hour).padStart(2, "0")}:00`;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/// A calendar's hours with each day as a column, as on the desktop: the day names and the
/// all day items on top, the hours below, every item a block where it belongs. Blocks keep
/// to their column: a title that does not fit is cut, and room numbers and the like appear
/// only when the block is wide and tall enough to hold them.
export function TimeGrid({
  days,
  items,
  width,
  colorOf,
}: {
  days: string[];
  items: AgendaItem[];
  /// The grid's own width, gutter included.
  width: number;
  colorOf: (spaceId: string) => string | undefined;
}) {
  const router = useRouter();
  const colors = useCalendarColors();
  const [startHour] = useSetting("calendar.dayStartHour");
  const [timeFormat] = useSetting("general.timeFormat");
  const now = useNowMinutes();
  const today = localDay();
  const scroll = useRef<ScrollView>(null);
  const gutter = width >= 600 ? 52 : 40;
  const column = (width - gutter) / days.length;
  const narrow = column < 60;
  // "timezone" leaves it to the phone's own clock.
  const twelve =
    timeFormat === "american" ||
    (timeFormat === "timezone" && /AM|PM/i.test(new Date(2026, 0, 1, 15).toLocaleTimeString()));
  const content = days.map((day) => ({ day, ...segmentsForDay(items, day) }));
  const foldedRows = Math.min(MAX_ALL_DAY, Math.max(...content.map((c) => c.allDay.length), 0));
  useEffect(() => {
    scroll.current?.scrollTo({ y: Math.max(0, startHour * HOUR_PX - 4), animated: false });
  }, [startHour, days.length]);

  const open = (id: string) => router.push(`/entity/${id}`);

  return (
    <View className="flex-1" style={{ width }}>
      <View className="border-b border-border" style={{ paddingLeft: gutter }}>
        <View className="flex-row">
          {days.map((day) => {
            const { weekday, number, date } = dayParts(day);
            const isToday = day === today;
            return (
              <View
                key={day}
                className="items-center gap-0.5 py-1.5"
                style={{ width: column }}
                accessibilityLabel={date.toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              >
                <Text
                  variant="small"
                  tone="muted"
                  numberOfLines={1}
                  className={isToday ? "font-medium" : undefined}
                  style={isToday ? { color: colors.today.label } : undefined}
                >
                  {narrow
                    ? DAY_NARROW[weekday]
                    : date.toLocaleDateString(undefined, { weekday: "short" })}
                </Text>
                <View
                  className="h-6 min-w-6 items-center justify-center rounded-full px-1"
                  style={isToday ? { backgroundColor: colors.today.pill } : undefined}
                >
                  <Text
                    variant="small"
                    className="font-medium"
                    style={isToday ? { color: colors.today.pillText } : undefined}
                  >
                    {number}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        {foldedRows > 0 ? (
          <View className="flex-row pb-1">
            {content.map(({ day, allDay }) => (
              <View key={day} style={{ width: column }} className="gap-0.5 px-px">
                {allDay.slice(0, MAX_ALL_DAY).map((item) => {
                  const look = allDayChipLook(item.kind);
                  const color = colors.accent(item.kind, colorOf(item.spaceId));
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title || "Untitled"}, all day`}
                      onPress={() => open(item.id)}
                      className="justify-center overflow-hidden rounded px-1 active:opacity-70"
                      style={{
                        height: ALL_DAY_ROW_PX,
                        backgroundColor: withAlpha(color, look.fillAlpha),
                        borderWidth: look.borderWidth,
                        borderColor: withAlpha(color, look.borderAlpha),
                        borderLeftWidth: look.leftBar || look.borderWidth,
                        borderLeftColor: color,
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontSize: narrow ? 9 : 11, lineHeight: 14 }}>
                        {item.title || "Untitled"}
                      </Text>
                    </Pressable>
                  );
                })}
                {allDay.length > MAX_ALL_DAY ? (
                  <Text variant="small" tone="muted" style={{ fontSize: 10 }}>
                    + {allDay.length - MAX_ALL_DAY}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <ScrollView ref={scroll} className="flex-1" showsVerticalScrollIndicator={false}>
        <View style={{ height: 24 * HOUR_PX }} className="flex-row">
          <View style={{ width: gutter }}>
            {HOURS.map((hour) => (
              <Text
                key={hour}
                variant="small"
                tone="muted"
                numberOfLines={1}
                className="absolute right-1 text-right"
                style={{ top: hour * HOUR_PX - 7, fontSize: 10, opacity: hour === 0 ? 0 : 1 }}
              >
                {hourLabel(hour, twelve)}
              </Text>
            ))}
          </View>
          <View style={{ width: column * days.length }}>
            {HOURS.map((hour) => (
              <View
                key={hour}
                className="absolute inset-x-0 border-t border-border/60"
                style={{ top: hour * HOUR_PX }}
              />
            ))}
            {content.map(({ day, timed }, index) => {
              const lanes = layoutLanes(timed, (MIN_BLOCK_PX / HOUR_PX) * 60);
              return (
                <View
                  key={day}
                  className="absolute inset-y-0 border-l border-border/60"
                  style={{
                    left: index * column,
                    width: column,
                    backgroundColor:
                      day === today
                        ? withAlpha(colors.today.column.base, colors.today.column.alpha)
                        : undefined,
                  }}
                >
                  {timed.map((segment: Segment<AgendaItem>) => {
                    const { item } = segment;
                    const lane = lanes.get(segment);
                    if (!lane) return null;
                    const g = blockGeometry(segment, lane, HOUR_PX, MIN_BLOCK_PX);
                    const w = g.width * column - 2;
                    const look = blockLook(item.kind);
                    const color = colors.accent(item.kind, colorOf(item.spaceId));
                    const lines = Math.max(1, Math.floor((g.height - 6) / 13));
                    const roomy = w >= 90 && g.height >= 44;
                    const time = [item.startTime, item.endTime].filter(Boolean).join(" to ");
                    return (
                      <Pressable
                        key={`${item.id}-${day}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title || "Untitled"}, ${time}`}
                        onPress={() => open(item.id)}
                        className="absolute overflow-hidden rounded-md active:opacity-70"
                        style={{
                          left: g.left * column + 1,
                          top: g.top + 1,
                          width: w,
                          height: g.height - 2,
                          backgroundColor: withAlpha(color, look.fillAlpha),
                          borderWidth: look.borderWidth,
                          borderColor: withAlpha(color, look.borderAlpha),
                          borderLeftWidth: look.leftBar || look.borderWidth,
                          borderLeftColor: color,
                          paddingHorizontal: narrow ? 2 : 5,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          // A sliver of a lane keeps to one line; wrapping it would break words apart.
                          numberOfLines={w < 44 ? 1 : roomy ? Math.min(lines, 2) : lines}
                          style={{ fontSize: narrow ? 9 : 11, lineHeight: narrow ? 11 : 13 }}
                          className="font-medium"
                        >
                          {item.title || "Untitled"}
                        </Text>
                        {roomy ? (
                          <Text
                            numberOfLines={1}
                            tone="muted"
                            style={{ fontSize: 10, lineHeight: 12 }}
                          >
                            {[time, item.location].filter(Boolean).join(" · ")}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {day === today ? (
                    <View
                      pointerEvents="none"
                      className="absolute inset-x-0 h-0.5 bg-destructive"
                      style={{ top: (now / DAY_MINUTES) * 24 * HOUR_PX - 1 }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
