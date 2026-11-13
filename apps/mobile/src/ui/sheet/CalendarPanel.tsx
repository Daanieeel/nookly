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
import { haptic } from "../haptics.ts";
import { type FallbackIcon, Glyph, type SymbolName } from "../kit/Glyph.tsx";
import { Label } from "../kit/Label.tsx";
import { useScheme, useSemantic } from "../kit/scheme.ts";
import { Surface } from "../kit/Surface.tsx";
import { SPACE, TINT, TINT_FILL, withAlpha } from "../tokens.ts";
import { MIN_TOUCH } from "../touch.ts";

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

/// The desktop's `Calendar` as iOS's inline date picker draws it (D50): the month with its
/// arrows in the accent, the weekdays small and muted, six weeks of days, today in the
/// accent and the picked day in a filled accent circle. Each day is a finger's height.
export function CalendarPanel({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (day: string) => void;
}) {
  const scheme = useScheme();
  const accent = TINT.blue[scheme];
  const pressedFill = useSemantic("pressed");
  const weekStart = useWeekStart();
  const today = localDay();
  const [month, setMonth] = useState(() => firstOfMonth(value ?? today));
  const start = startOfWeek(month, weekStart);
  // Always six weeks, as on the desktop, so the sheet keeps its height month to month.
  const days = Array.from({ length: 42 }, (_, i) => addDaysTo(start, i));
  const title = toDate(month).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const turn = (by: number) => {
    haptic("select");
    setMonth(addMonthsTo(month, by));
  };
  return (
    <Surface padding={SPACE.sm}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: SPACE.sm }}>
        <Label type="headline" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </Label>
        <MonthArrow
          label="Previous Month"
          symbol="chevron.left"
          fallback={IconChevronLeft}
          color={accent}
          onPress={() => turn(-1)}
        />
        <MonthArrow
          label="Next Month"
          symbol="chevron.right"
          fallback={IconChevronRight}
          color={accent}
          onPress={() => turn(1)}
        />
      </View>
      <View style={{ flexDirection: "row", paddingVertical: SPACE.xs }}>
        {days.slice(0, 7).map((day) => (
          <Label
            key={day}
            type="footnote"
            color="tertiaryLabel"
            weight="600"
            style={{ flex: 1, textAlign: "center" }}
          >
            {toDate(day).toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
          </Label>
        ))}
      </View>
      <View accessibilityLabel={title}>
        {[0, 1, 2, 3, 4, 5].map((week) => (
          <View key={week} style={{ flexDirection: "row" }}>
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const selected = day === value;
              const isToday = day === today;
              const inMonth = sameMonth(day, month);
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
                  unstable_pressDelay={0}
                  onPress={() => {
                    haptic("select");
                    onSelect(day);
                  }}
                  style={{
                    flex: 1,
                    height: MIN_TOUCH,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        width: DAY,
                        height: DAY,
                        borderRadius: DAY / 2,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selected
                          ? accent
                          : pressed
                            ? pressedFill
                            : isToday
                              ? withAlpha(accent, TINT_FILL[scheme])
                              : undefined,
                      }}
                    >
                      <Label
                        type="title3"
                        weight={selected || isToday ? "600" : "400"}
                        color={inMonth ? "label" : "tertiaryLabel"}
                        tint={selected ? "#ffffff" : isToday ? accent : undefined}
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {String(toDate(day).getDate())}
                      </Label>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Surface>
  );
}

/// How wide a day's circle is.
const DAY = 40;

function MonthArrow({
  label,
  symbol,
  fallback,
  color,
  onPress,
}: {
  label: string;
  symbol: SymbolName;
  fallback: FallbackIcon;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      unstable_pressDelay={0}
      style={({ pressed }) => ({
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.4 : 1,
      })}
    >
      <Glyph
        name={symbol}
        fallback={fallback}
        size={20}
        color={color}
        hex={color}
        weight="semibold"
      />
    </Pressable>
  );
}
