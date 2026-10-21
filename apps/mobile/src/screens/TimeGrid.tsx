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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useSetting } from "../data/settings.ts";
import { cn } from "../ui/classes.ts";
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

/// The width of the column of hour labels for a grid this wide.
export const gutterFor = (width: number) => (width >= 600 ? 52 : 40);

/// The pages either side of the one shown, drawn already so a swipe carries them in, and
/// the style that slides all three together.
export interface Neighbours {
  before: string[];
  after: string[];
  slide: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
}

/// A calendar's hours with each day as a column, as on the desktop: the day names and the
/// all day items on top, the hours below, every item a block where it belongs. Blocks keep
/// to their column: a title that does not fit is cut, and room numbers and the like appear
/// only when the block is wide and tall enough to hold them.
export function TimeGrid({
  days,
  neighbours,
  items,
  width,
  colorOf,
}: {
  days: string[];
  neighbours?: Neighbours;
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
  const insets = useSafeAreaInsets();
  const gutter = gutterFor(width);
  const area = width - gutter;
  const column = area / days.length;
  const narrow = column < 60;
  // "timezone" leaves it to the phone's own clock.
  const twelve =
    timeFormat === "american" ||
    (timeFormat === "timezone" && /AM|PM/i.test(new Date(2026, 0, 1, 15).toLocaleTimeString()));
  const pages = neighbours ? [neighbours.before, days, neighbours.after] : [days];
  const strip = [
    {
      flexDirection: "row" as const,
      width: area * pages.length,
      left: neighbours ? -area : 0,
    },
    neighbours?.slide,
  ];
  // The hours open at the hour the day starts: set as the starting offset, and again
  // when the setting or the number of days changes (the content is laid out by then).
  const startY = Math.max(0, startHour * HOUR_PX - 4);
  useEffect(() => {
    scroll.current?.scrollTo({ y: startY, animated: false });
  }, [startY, days.length]);

  const open = (id: string) => router.push(`/entity/${id}`);

  /// The day names of a page, and its all day items under them.
  const renderHeader = (pageDays: string[]) => {
    const content = pageDays.map((day) => ({ day, ...segmentsForDay(items, day) }));
    const rows = Math.min(MAX_ALL_DAY, Math.max(...content.map((c) => c.allDay.length), 0));
    return (
      <View key={pageDays[0]} style={{ width: area }}>
        <View className="flex-row">
          {pageDays.map((day, index) => {
            const { weekday, number, date } = dayParts(day);
            const isToday = day === today;
            return (
              <View
                key={day}
                className={cn(
                  "items-center gap-0.5 border-l py-1.5",
                  index === pageDays.length - 1 && "border-r",
                )}
                style={{ width: column, borderColor: colors.gridline }}
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
        {rows > 0 ? (
          <View className="flex-row">
            {content.map(({ day, allDay }, index) => (
              <View
                key={day}
                testID="all-day-day"
                style={{ width: column, borderColor: colors.gridline }}
                className={cn(
                  "gap-0.5 border-l px-px pb-1",
                  index === content.length - 1 && "border-r",
                )}
              >
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
    );
  };

  /// The hours of a page: a line for each, a column for each day with its blocks.
  const renderColumns = (pageDays: string[]) => {
    const content = pageDays.map((day) => ({ day, ...segmentsForDay(items, day) }));
    return (
      <View key={pageDays[0]} style={{ width: area, height: 24 * HOUR_PX }}>
        {HOURS.map((hour) => (
          <View
            key={hour}
            testID="gridline"
            className="absolute inset-x-0 border-t"
            style={{ top: hour * HOUR_PX, borderColor: colors.gridline }}
          />
        ))}
        {content.map(({ day, timed }, index) => {
          const lanes = layoutLanes(timed, (MIN_BLOCK_PX / HOUR_PX) * 60);
          return (
            <View
              key={day}
              testID="gridline"
              className={cn(
                "absolute inset-y-0 border-l",
                index === pageDays.length - 1 && "border-r",
              )}
              style={{
                borderColor: colors.gridline,
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
                      <Text numberOfLines={1} tone="muted" style={{ fontSize: 10, lineHeight: 12 }}>
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
    );
  };

  return (
    <View className="flex-1" style={{ width }}>
      <View
        testID="gridline"
        className="border-b"
        style={{ paddingLeft: gutter, borderColor: colors.gridline }}
      >
        <View style={{ width: area, overflow: "hidden" }}>
          <Animated.View testID="page-strip" style={strip}>
            {pages.map(renderHeader)}
          </Animated.View>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        testID="hours"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: startY }}
        // The last hour clears the home bar instead of sitting under it.
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        directionalLockEnabled
      >
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
          <View style={{ width: area, overflow: "hidden" }}>
            <Animated.View testID="page-strip" style={strip}>
              {pages.map(renderColumns)}
            </Animated.View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
