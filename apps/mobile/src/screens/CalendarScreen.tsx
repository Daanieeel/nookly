import {
  addDaysTo,
  addMonthsTo,
  automaticWeekStart,
  monthGrid,
  resolveWeekStart,
  sameMonth,
  weekDays,
} from "@nookly/shared/calendar-grid";
import type { AgendaItem } from "@nookly/shared/data";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSetting } from "../data/settings.ts";
import { useAgenda, useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { Button, IconButton } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { cn } from "../ui/classes.ts";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { usePaneWidth } from "../ui/pane.tsx";
import { useTheme } from "../ui/theme.ts";
import { addDays, dayLabel, localDay } from "./dates.ts";
import { useSyncRefresh } from "./useSyncRefresh.ts";

const AGENDA_DAYS = 14;
/// From this width the week is seven columns, as on the desktop.
const WIDE = 700;

type CalendarView = "agenda" | "day" | "week" | "month";
const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "agenda", label: "Agenda" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const KIND_LABELS = {
  session: "Session",
  calendar_entry: null,
  exam: "Exam",
  study_block: "Study block",
} as const;

export function AgendaRow({ item, color }: { item: AgendaItem; color?: string }) {
  const router = useRouter();
  const time = item.allDay
    ? "All day"
    : [item.startTime, item.endTime].filter(Boolean).join(" to ");
  return (
    <Row
      title={item.title || (item.kind === "session" ? "Session" : "Untitled")}
      subtitle={[KIND_LABELS[item.kind], time, item.location].filter(Boolean).join(", ")}
      icon={
        <View
          className="w-1 self-stretch rounded-full bg-border"
          style={color ? { backgroundColor: color } : undefined}
        />
      }
      trailing={color ? <SpaceDot color={color} /> : null}
      onPress={() => router.push(`/entity/${item.id}`)}
    />
  );
}

const onDay = (items: AgendaItem[], day: string) =>
  items.filter((i) => i.date <= day && (i.endDate ?? i.date) >= day);

/// The days a view shows and the label it carries.
function useRange(view: CalendarView, anchor: string) {
  const [setting] = useSetting("calendar.weekStart");
  const [dateFormat] = useSetting("general.dateFormat");
  const weekStart = resolveWeekStart(setting, automaticWeekStart(dateFormat));
  if (view === "day") {
    return { weekStart, from: anchor, to: anchor, title: dayLabel(anchor) };
  }
  if (view === "week") {
    const days = weekDays(anchor, weekStart);
    const first = new Date(`${days[0]}T00:00:00`);
    const last = new Date(`${days[6]}T00:00:00`);
    const short = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return { weekStart, from: days[0], to: days[6], title: `${short(first)} to ${short(last)}` };
  }
  if (view === "month") {
    const grid = monthGrid(anchor, weekStart);
    const title = new Date(`${anchor}T00:00:00`).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return { weekStart, from: grid[0][0], to: grid.at(-1)?.[6] ?? anchor, title };
  }
  const today = localDay();
  return { weekStart, from: today, to: addDays(today, AGENDA_DAYS - 1), title: "Next two weeks" };
}

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

/// Seven columns on a tablet, a list of days on a phone.
function WeekView({
  days,
  items,
  colorOf,
}: {
  days: string[];
  items: AgendaItem[];
  colorOf: (spaceId: string) => string | undefined;
}) {
  const width = usePaneWidth();
  const router = useRouter();
  const today = localDay();
  if (width < WIDE) {
    return (
      <>
        {days.map((day) => (
          <DayList key={day} items={items} day={day} colorOf={colorOf} />
        ))}
      </>
    );
  }
  return (
    <View className="flex-row gap-1.5">
      {days.map((day) => (
        <View key={day} className="flex-1 gap-1.5">
          <Text
            variant="small"
            className={cn("text-center font-medium", day === today && "text-primary")}
          >
            {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
            })}
          </Text>
          {onDay(items, day).map((item) => (
            <Pressable
              key={`${item.id}-${day}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${dayLabel(day, today)}`}
              onPress={() => router.push(`/entity/${item.id}`)}
              className="rounded-md border-l-4 bg-card p-1.5 active:opacity-70"
              style={{ borderLeftColor: colorOf(item.spaceId) ?? "#94a3b8" }}
            >
              <Text variant="small" numberOfLines={2}>
                {item.title || "Untitled"}
              </Text>
              {!item.allDay && item.startTime ? (
                <Text variant="small" tone="muted">
                  {item.startTime}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
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
                        style={{ backgroundColor: colorOf(item.spaceId) ?? "#94a3b8" }}
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
/// color, as an agenda or a day, a week or a month, like the desktop's unified Calendar.
export function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = localDay();
  const [view, setView] = useState<CalendarView>("agenda");
  const [anchor, setAnchor] = useState(today);
  const range = useRange(view, anchor);
  const { data: items = [] } = useAgenda(range.from, range.to);
  const { data: spaces = [] } = useSpaces();
  const { refreshing, onRefresh } = useSyncRefresh();
  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;
  const step = (direction: 1 | -1) =>
    setAnchor((day) =>
      view === "month"
        ? addMonthsTo(day, direction)
        : addDaysTo(day, direction * (view === "week" ? 7 : 1)),
    );
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(today, i));
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              label="New Calendar Entry"
              icon={<IconPlus size={22} color={theme.colors.foreground} />}
              onPress={() => router.push("/new/entry")}
            />
          ),
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing} wide>
        <ChipGroup label="View">
          {VIEWS.map((v) => (
            <Chip
              key={v.id}
              label={v.label}
              selected={view === v.id}
              onPress={() => {
                setView(v.id);
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
        {view === "agenda" ? (
          <>
            {items.length === 0 ? <Text tone="muted">Nothing in the next two weeks.</Text> : null}
            {days
              .filter((day) => onDay(items, day).length > 0 || day === today)
              .map((day) => (
                <DayList key={day} items={items} day={day} colorOf={colorOf} />
              ))}
          </>
        ) : null}
        {view === "day" ? <DayList items={items} day={anchor} colorOf={colorOf} /> : null}
        {view === "week" ? (
          <WeekView days={weekDays(anchor, range.weekStart)} items={items} colorOf={colorOf} />
        ) : null}
        {view === "month" ? (
          <MonthView
            anchor={anchor}
            weekStart={range.weekStart}
            items={items}
            picked={anchor}
            onPick={setAnchor}
            colorOf={colorOf}
          />
        ) : null}
      </Screen>
    </>
  );
}
