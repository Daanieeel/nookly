import { INPUT_CLASSES } from "@nookly/ui/classes";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSetting } from "../data/settings.ts";
import { cn, row, splitText } from "./classes.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { FIELD_HEIGHT, MIN_TOUCH } from "./touch.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/// Whether times read on a 12 hour clock: the American format, or the phone's own clock
/// when the setting leaves it to the time zone.
function useTwelveHour(): boolean {
  const [timeFormat] = useSetting("general.timeFormat");
  return (
    timeFormat === "american" ||
    (timeFormat === "timezone" && /AM|PM/i.test(new Date(2026, 0, 1, 15).toLocaleTimeString()))
  );
}

function parse(value: string | null) {
  const [h, m] = (value ?? "").split(":").map(Number);
  return { hour: Number.isFinite(h) ? h : null, minute: Number.isFinite(m) ? m : null };
}

/// The desktop's `TimeInput`: a field of typed segments, hour and minute and, on a 12 hour
/// clock, AM or PM, in the chosen time format. The phone types them with its number pad.
/// Values are `HH:mm`.
export function TimeInput({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string | null;
  onChange: (time: string) => void;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const twelve = useTwelveHour();
  const { hour, minute } = parse(value);
  const shownHour = (h: number | null) =>
    h === null ? "" : twelve ? String(h % 12 === 0 ? 12 : h % 12) : pad(h);
  const [hourText, setHourText] = useState(shownHour(hour));
  const [minuteText, setMinuteText] = useState(minute === null ? "" : pad(minute));
  const minuteField = useRef<TextInput>(null);
  // What was last set here: the hour typed a moment ago, before `value` comes back with it.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    setHourText(shownHour(hour));
    setMinuteText(minute === null ? "" : pad(minute));
    // Only a new value from outside resets what is typed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [value, twelve]);
  const pm = hour !== null && hour >= 12;
  const now = () => parse(latest.current);

  const commit = (h: number | null, m: number | null) => {
    if (h === null || m === null) return;
    const next = `${pad(h)}:${pad(m)}`;
    if (next === latest.current) return;
    latest.current = next;
    onChange(next);
  };
  const typedHour = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    setHourText(digits);
    const n = Number(digits);
    if (!digits) return;
    const valid = twelve ? n >= 1 && n <= 12 : n >= 0 && n <= 23;
    if (!valid) return;
    const h = twelve ? (n % 12) + (pm ? 12 : 0) : n;
    commit(h, now().minute ?? 0);
    if (digits.length === 2 || (twelve ? n > 1 : n > 2)) minuteField.current?.focus();
  };
  const typedMinute = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    setMinuteText(digits);
    const n = Number(digits);
    if (digits.length === 2 && n <= 59) commit(now().hour ?? 0, n);
  };
  const input = splitText(row(INPUT_CLASSES));
  const segment = "w-8 text-center font-sans text-sm tabular-nums text-foreground";
  return (
    <View
      accessibilityLabel={label}
      className={cn(input.box, "items-center gap-0.5 self-start")}
      style={FIELD_HEIGHT}
    >
      <TextInput
        accessibilityLabel={`${label}, hour`}
        value={hourText}
        onChangeText={typedHour}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        autoFocus={autoFocus}
        placeholder="--"
        placeholderTextColor={theme.colors.mutedForeground}
        className={cn(segment, "h-full")}
      />
      <Text tone="muted">:</Text>
      <TextInput
        ref={minuteField}
        accessibilityLabel={`${label}, minute`}
        value={minuteText}
        onChangeText={typedMinute}
        onEndEditing={() => {
          if (minuteText.length === 1) commit(now().hour ?? 0, Number(minuteText));
        }}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        placeholder="--"
        placeholderTextColor={theme.colors.mutedForeground}
        className={cn(segment, "h-full")}
      />
      {twelve ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pm ? "PM, switch to AM" : "AM, switch to PM"}
          onPress={() => {
            const { hour: h, minute: m } = now();
            if (h !== null) commit((h + 12) % 24, m ?? 0);
          }}
          style={{ minWidth: MIN_TOUCH, height: MIN_TOUCH }}
          className="items-center justify-center"
        >
          <Text className="tabular-nums">{pm ? "PM" : "AM"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
