import {
  addDaysTo,
  addMonthsTo,
  automaticWeekStart,
  firstOfMonth,
  resolveWeekStart,
  sameMonth,
  startOfWeek,
} from "@nookly/shared/calendar-grid";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSetting } from "../../data/settings.ts";
import { localDay } from "../../screens/dates.ts";
import { IconButton } from "../Button.tsx";
import { cn } from "../classes.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { CONTROL_SIZE, MIN_TOUCH, gapBetween } from "../touch.ts";

const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/// The first day of the week the settings ask for, as the desktop's pickers use it.
function useWeekStart() {
  const [setting] = useSetting("calendar.weekStart");
  const [dateFormat] = useSetting("general.dateFormat");
  return resolveWeekStart(setting, automaticWeekStart(dateFormat));
}

/// The desktop's `Calendar`: the month and its arrows, the weekdays, and six weeks of days,
/// today in blue with a dot, the picked day filled. Each day is a finger's height.
export function CalendarPanel({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (day: string) => void;
}) {
  const theme = useTheme();
  const weekStart = useWeekStart();
  const today = localDay();
  const [month, setMonth] = useState(() => firstOfMonth(value ?? today));
  const start = startOfWeek(month, weekStart);
  // Always six weeks, as on the desktop, so the sheet keeps its height month to month.
  const days = Array.from({ length: 42 }, (_, i) => addDaysTo(start, i));
  const title = toDate(month).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="pl-1 font-medium">{title}</Text>
        <View className="flex-row items-center" style={{ gap: gapBetween(CONTROL_SIZE.icon) }}>
          <IconButton
            label="Previous Month"
            icon={<IconChevronLeft size={18} color={theme.colors.foreground} />}
            onPress={() => setMonth(addMonthsTo(month, -1))}
          />
          <IconButton
            label="Next Month"
            icon={<IconChevronRight size={18} color={theme.colors.foreground} />}
            onPress={() => setMonth(addMonthsTo(month, 1))}
          />
        </View>
      </View>
      <View className="flex-row">
        {days.slice(0, 7).map((day) => (
          <Text key={day} variant="small" tone="muted" className="flex-1 py-1 text-center">
            {toDate(day).toLocaleDateString(undefined, { weekday: "short" })}
          </Text>
        ))}
      </View>
      <View accessibilityLabel={title}>
        {[0, 1, 2, 3, 4, 5].map((week) => (
          <View key={week} className="flex-row">
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const selected = day === value;
              const isToday = day === today;
              const label = toDate(day).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              });
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(day)}
                  style={{ height: MIN_TOUCH }}
                  className="flex-1 items-center justify-center"
                >
                  {({ pressed }) => (
                    <View
                      className={cn(
                        "h-9 w-11 items-center justify-center rounded-md",
                        pressed && !selected && "bg-accent",
                        selected && "bg-primary",
                      )}
                    >
                      <Text
                        className={cn(
                          "tabular-nums",
                          !sameMonth(day, month) && "text-muted-foreground/50",
                          isToday && !selected && "font-semibold text-primary",
                          selected && "font-medium text-primary-foreground",
                        )}
                      >
                        {String(toDate(day).getDate())}
                      </Text>
                      {isToday ? (
                        <View
                          className={cn(
                            "absolute bottom-1 size-1 rounded-full",
                            selected ? "bg-primary-foreground" : "bg-primary",
                          )}
                        />
                      ) : null}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
