import {
  addDaysTo,
  addMonthsTo,
  automaticWeekStart,
  monthGrid,
  resolveWeekStart,
  sameMonth,
} from "@nookly/shared/calendar-grid";
import type { AgendaItem } from "@nookly/shared/data";
import { type GridView, daysOfView } from "@nookly/shared/time-grid";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { z } from "zod";
import { Pressable, View } from "react-native";
import { useSetting } from "../data/settings.ts";
import { usePreference } from "../data/preferences.ts";
import { useAgenda, useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { Button, IconButton } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { PAGE_BACKGROUND, cn } from "../ui/classes.ts";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { usePaneWidth } from "../ui/pane.tsx";
import { useTheme } from "../ui/theme.ts";
import { addDays, dayLabel, localDay } from "./dates.ts";
import { useCalendarColors } from "./calendar-colors.ts";
import { TimeGrid } from "./TimeGrid.tsx";
import { useSyncRefresh } from "./useSyncRefresh.ts";

const AGENDA_DAYS = 14;
/// From this pane width the calendar is the desktop's: day, work week, week and month.
const WIDE = 700;

type CalendarView = "agenda" | GridView | "month";

/// A phone: an agenda, and the hours of a day, three days or a week. An iPad, the desktop's:
/// the hours of a day, a work week and a week, and a month.
const PHONE_VIEWS: { id: CalendarView; label: string }[] = [
  { id: "agenda", label: "Agenda" },
  { id: "day", label: "Day" },
  { id: "threeDay", label: "3 Days" },
  { id: "week", label: "Week" },
];
const WIDE_VIEWS: { id: CalendarView; label: string }[] = [
  { id: "agenda", label: "Agenda" },
  { id: "day", label: "Day" },
  { id: "workWeek", label: "Work Week" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];
const viewSchema = z.enum(["agenda", "day", "threeDay", "workWeek", "week", "month"]);

const KIND_LABELS = {
  session: "Session",
  calendar_entry: null,
  exam: "Exam",
  study_block: "Study block",
} as const;

export function AgendaRow({ item, color }: { item: AgendaItem; color?: string }) {
  const router = useRouter();
  const colors = useCalendarColors();
  const accent = colors.accent(item.kind, color);
  const time = item.allDay
    ? "All day"
    : [item.startTime, item.endTime].filter(Boolean).join(" to ");
  return (
    <Row
      title={item.title || (item.kind === "session" ? "Session" : "Untitled")}
      subtitle={[KIND_LABELS[item.kind], time, item.location].filter(Boolean).join(", ")}
      icon={<View className="w-1 self-stretch rounded-full" style={{ backgroundColor: accent }} />}
      trailing={color ? <SpaceDot color={color} /> : null}
      onPress={() => router.push(`/entity/${item.id}`)}
    />
  );
}

const onDay = (items: AgendaItem[], day: string) =>
  items.filter((i) => i.date <= day && (i.endDate ?? i.date) >= day);

const NO_DAYS: string[] = [];

/// The days a view shows and the label it carries.
function useRange(view: CalendarView, anchor: string) {
  const [setting] = useSetting("calendar.weekStart");
  const [dateFormat] = useSetting("general.dateFormat");
  const weekStart = resolveWeekStart(setting, automaticWeekStart(dateFormat));
  if (view === "agenda") {
    const today = localDay();
    return {
      weekStart,
      days: NO_DAYS,
      from: today,
      to: addDays(today, AGENDA_DAYS - 1),
      title: "Next two weeks",
    };
  }
  if (view === "month") {
    const grid = monthGrid(anchor, weekStart);
    const title = new Date(`${anchor}T00:00:00`).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return { weekStart, days: NO_DAYS, from: grid[0][0], to: grid.at(-1)?.[6] ?? anchor, title };
  }
  const days = daysOfView(view, anchor, weekStart);
  const short = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const title =
    days.length === 1 ? dayLabel(anchor) : `${short(days[0])} to ${short(days[days.length - 1])}`;
  return { weekStart, days, from: days[0], to: days[days.length - 1], title };
}

/// How far Previous and Next move a view.
const STEP_DAYS = { day: 1, threeDay: 3, workWeek: 7, week: 7 } satisfies Record<GridView, number>;

/// What a day holds: its items in their Space's color.
function DayList({
  items,
  day,
  colorOf,
  title,
}: {
  items: AgendaItem[];
  day: string;
  colorOf: (spaceId: string) => string | undefined;
  title?: string;
}) {
  const today = localDay();
  const here = onDay(items, day);
  return (
    <Section title={title ?? dayLabel(day, today)}>
      {here.length === 0 ? (
        <Empty text="Nothing planned." />
      ) : (
        here.map((item) => (
          <View key={`${item.id}-${day}`}>
            <AgendaRow item={item} color={colorOf(item.spaceId)} />
          </View>
        ))
      )}
    </Section>
  );
}

/// The month as a grid with a mark for each thing on a day; the day picked lists below.
function MonthView({
  anchor,
  weekStart,
  items,
  picked,
  onPick,
  colorOf,
}: {
  anchor: string;
  weekStart: 0 | 1 | 6;
  items: AgendaItem[];
  picked: string;
  onPick: (day: string) => void;
  colorOf: (spaceId: string) => string | undefined;
}) {
  const today = localDay();
  const colors = useCalendarColors();
  const grid = monthGrid(anchor, weekStart);
  return (
    <>
      <View className="gap-1" accessibilityLabel="Month">
        <View className="flex-row">
          {grid[0].map((day) => (
            <Text key={day} variant="small" tone="muted" className="flex-1 text-center">
              {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
            </Text>
          ))}
        </View>
        {grid.map((week) => (
          <View key={week[0]} className="flex-row gap-1">
            {week.map((day) => {
              const here = onDay(items, day);
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(day, today)}, ${here.length} ${here.length === 1 ? "item" : "items"}`}
                  accessibilityState={{ selected: day === picked }}
                  onPress={() => onPick(day)}
                  className={cn(
                    "h-14 flex-1 items-center gap-1 rounded-md pt-1 active:bg-accent",
                    day === picked && "bg-accent",
                    day === today && "border border-primary",
                  )}
                >
                  <Text
                    variant="small"
                    tone={sameMonth(day, anchor) ? "default" : "muted"}
                    className={cn(day === today && "font-semibold text-primary")}
                  >
                    {Number(day.slice(8))}
                  </Text>
                  <View className="flex-row gap-0.5">
                    {here.slice(0, 3).map((item) => (
                      <View
                        key={item.id}
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: colors.accent(item.kind, colorOf(item.spaceId)) }}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <DayList items={items} day={picked} colorOf={colorOf} />
    </>
  );
}

/// Every Space's Sessions, Calendar entries, Exams and Study blocks in their Space's
/// color: an agenda, or the hours of a day, three days, a week; on an iPad the desktop's
/// day, work week, week and month.
///
/// With `spaceId` it is one Space's own page (its Sessions or its Calendar module): the same
/// grids with only that Space's items, and "+" makes a `create` there.
export function CalendarScreen({
  spaceId,
  create = "entry",
}: {
  spaceId?: string;
  create?: "entry" | "session";
} = {}) {
  const theme = useTheme();
  const router = useRouter();
  const today = localDay();
  const width = usePaneWidth();
  const wide = width >= WIDE;
  const available = wide ? WIDE_VIEWS : PHONE_VIEWS;
  const [stored, setStored] = usePreference("calendar.view", viewSchema, wide ? "week" : "agenda");
  // A view the screen does not have at this width (a month on a phone) falls back.
  const view: CalendarView = available.some((v) => v.id === stored)
    ? stored
    : wide
      ? "week"
      : "agenda";
  const [anchor, setAnchor] = useState(today);
  const range = useRange(view, anchor);
  const { data: everything = [] } = useAgenda(range.from, range.to);
  const items = spaceId ? everything.filter((i) => i.spaceId === spaceId) : everything;
  const { data: spaces = [] } = useSpaces();
  const { refreshing, onRefresh } = useSyncRefresh();
  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;
  const step = (direction: 1 | -1) =>
    setAnchor((day) =>
      view === "month"
        ? addMonthsTo(day, direction)
        : view === "agenda"
          ? day
          : addDaysTo(day, direction * STEP_DAYS[view]),
    );
  const agendaDays = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(today, i));
  const controls = (
    <>
      <ChipGroup label="View">
        {available.map((v) => (
          <Chip
            key={v.id}
            label={v.label}
            selected={view === v.id}
            onPress={() => {
              setStored(v.id);
              if (v.id === "agenda") setAnchor(today);
            }}
          />
        ))}
      </ChipGroup>
      {view !== "agenda" ? (
        <View className="flex-row items-center gap-1">
          <IconButton
            label="Previous"
            icon={<IconChevronLeft size={20} color={theme.colors.foreground} />}
            onPress={() => step(-1)}
          />
          <Text className="flex-1 text-center font-medium" accessibilityRole="header">
            {range.title}
          </Text>
          <IconButton
            label="Next"
            icon={<IconChevronRight size={20} color={theme.colors.foreground} />}
            onPress={() => step(1)}
          />
          <Button label="Today" variant="ghost" size="sm" onPress={() => setAnchor(today)} />
        </View>
      ) : null}
    </>
  );
  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <IconButton
            label={create === "session" ? "New Session" : "New Calendar Entry"}
            icon={<IconPlus size={22} color={theme.colors.foreground} />}
            onPress={() => router.push(`/new/${create}${spaceId ? `?spaceId=${spaceId}` : ""}`)}
          />
        ),
      }}
    />
  );
  if (view !== "agenda" && view !== "month") {
    // The hours fill the screen and scroll on their own; only the controls sit above them.
    return (
      <>
        {header}
        <View className={cn("flex-1 gap-2 pt-3", PAGE_BACKGROUND)}>
          <View className="gap-2 px-3">{controls}</View>
          <TimeGrid days={range.days} items={items} width={width} colorOf={colorOf} />
        </View>
      </>
    );
  }
  return (
    <>
      {header}
      <Screen onRefresh={onRefresh} refreshing={refreshing} wide>
        {controls}
        {view === "agenda" ? (
          <>
            {items.length === 0 ? <Text tone="muted">Nothing in the next two weeks.</Text> : null}
            {agendaDays
              .filter((day) => onDay(items, day).length > 0 || day === today)
              .map((day) => (
                <DayList key={day} items={items} day={day} colorOf={colorOf} />
              ))}
          </>
        ) : (
          <MonthView
            anchor={anchor}
            weekStart={range.weekStart}
            items={items}
            picked={anchor}
            onPick={setAnchor}
            colorOf={colorOf}
          />
        )}
      </Screen>
    </>
  );
}
