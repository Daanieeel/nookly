import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, type TextStyle, View } from "react-native";
import { useSetting } from "../data/settings.ts";
import { Label } from "./kit/Label.tsx";
import { useTheme } from "./theme.ts";
import { useSemantic } from "./kit/scheme.ts";
import { CORNER, FACE, RADIUS, SPACE, TYPE } from "./tokens.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/// A time (`HH:mm`) as the clock in use writes it: `3:05 PM` on 12 hours, `15:05` on 24.
export function clockText(value: string, twelve: boolean): string {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  if (!twelve) return `${pad(h)}:${pad(m)}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

/// Whether times read on a 12 hour clock: the American format, or the phone's own clock
/// when the setting leaves it to the time zone.
export function useTwelveHour(): boolean {
  const [timeFormat] = useSetting("general.timeFormat");
  return (
    timeFormat === "american" ||
    (timeFormat === "timezone" && /AM|PM/i.test(new Date(2026, 0, 1, 15).toLocaleTimeString()))
  );
}

/// What typing into one segment (an hour or a minute) leaves: the digits it shows, the number
/// they stand for once it is in range, and whether the segment is full.
export interface Segment {
  text: string;
  value: number | null;
  done: boolean;
}

/// Typing into a segment as the desktop's does: a key on a full segment starts it over, a digit
/// no second one can follow finishes it ("7" reads "07"), two digits out of range start over
/// from the last, so nothing past `max` ever shows.
export function typeSegment(
  previous: string,
  text: string,
  range: { min: number; max: number },
): Segment {
  let typed = text.replace(/\D/g, "");
  if (typed.length > 2) {
    const added = typed.startsWith(previous) ? typed.slice(previous.length) : typed;
    typed = added.slice(-2);
    if (typed.length === 2 && previous.length === 2) typed = typed.slice(-1);
  }
  if (typed.length === 0) return { text: "", value: null, done: false };
  const n = Number(typed);
  if (typed.length === 1) {
    if (n * 10 > range.max) {
      return { text: pad(n), value: n >= range.min ? n : null, done: true };
    }
    return { text: typed, value: n >= range.min ? n : null, done: false };
  }
  if (n >= range.min && n <= range.max) return { text: typed, value: n, done: true };
  return typeSegment("", typed.slice(-1), range);
}

function parse(value: string | null) {
  if (!value) return { hour: null, minute: null };
  const [h, m] = value.split(":").map(Number);
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
  large = false,
}: {
  label: string;
  value: string | null;
  onChange: (time: string) => void;
  autoFocus?: boolean;
  /// A clock face to type on, for a sheet of its own: big digits on the sheet itself, a line
  /// under the hour and the minute as if writing into it.
  large?: boolean;
}) {
  const primary = useTheme().colors.primary;
  const fill = useSemantic("fill");
  const text = useSemantic("label");
  const placeholder = useSemantic("placeholder");
  const twelve = useTwelveHour();
  const { hour, minute } = parse(value);
  const shownHour = (h: number | null) =>
    h === null ? "" : twelve ? String(h % 12 === 0 ? 12 : h % 12) : pad(h);
  const [hourText, setHourText] = useState(shownHour(hour));
  const [minuteText, setMinuteText] = useState(minute === null ? "" : pad(minute));
  const minuteField = useRef<TextInput>(null);
  // What was last set here: the hour typed a moment ago, before `value` comes back with it.
  const latest = useRef(value);
  // What this field set last: that value coming back keeps the digits as typed ("1", not "01").
  const own = useRef<string | null>(null);
  useEffect(() => {
    latest.current = value;
    if (value !== null && value === own.current) return;
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
    own.current = next;
    onChange(next);
  };
  const typedHour = (text: string) => {
    const typed = typeSegment(hourText, text, twelve ? { min: 1, max: 12 } : { min: 0, max: 23 });
    setHourText(typed.text);
    if (typed.value === null) return;
    const h = twelve ? (typed.value % 12) + (pm ? 12 : 0) : typed.value;
    commit(h, now().minute ?? 0);
    if (typed.done) minuteField.current?.focus();
  };
  const typedMinute = (text: string) => {
    const typed = typeSegment(minuteText, text, { min: 0, max: 59 });
    setMinuteText(typed.text);
    if (typed.done && typed.value !== null) commit(now().hour ?? 0, typed.value);
  };
  const segment: TextStyle = large
    ? {
        width: 96,
        height: 72,
        textAlign: "center",
        fontFamily: FACE["500"],
        fontSize: 60,
        fontVariant: ["tabular-nums"],
        color: text,
        padding: 0,
      }
    : {
        width: 30,
        height: "100%",
        textAlign: "center",
        fontFamily: FACE["400"],
        fontSize: TYPE.body.fontSize,
        fontVariant: ["tabular-nums"],
        color: text,
        padding: 0,
      };
  /// A digit field, with its line under it on the clock face.
  const underlined = (name: string, input: React.ReactNode) =>
    large ? (
      <View style={{ alignItems: "center" }}>
        {input}
        <View
          testID={`${label}, ${name} underline`}
          style={{ width: 84, height: 2, borderRadius: 1, backgroundColor: primary }}
        />
      </View>
    ) : (
      input
    );
  return (
    <View
      accessibilityLabel={label}
      style={[
        CORNER,
        large
          ? { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: SPACE.xs }
          : {
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "center",
              height: 36,
              paddingHorizontal: SPACE.xs,
              borderRadius: RADIUS.control,
              backgroundColor: fill,
            },
      ]}
    >
      {underlined(
        "hour",
        <TextInput
          accessibilityLabel={`${label}, hour`}
          value={hourText}
          onChangeText={typedHour}
          keyboardType="number-pad"
          selectTextOnFocus
          autoFocus={autoFocus}
          placeholder="--"
          placeholderTextColor={placeholder}
          style={segment}
        />,
      )}
      {large ? (
        <Label color="secondaryLabel" style={{ fontSize: 52, lineHeight: 72, marginBottom: 2 }}>
          :
        </Label>
      ) : (
        <Label color="secondaryLabel">:</Label>
      )}
      {underlined(
        "minute",
        <TextInput
          ref={minuteField}
          accessibilityLabel={`${label}, minute`}
          value={minuteText}
          onChangeText={typedMinute}
          onEndEditing={() => {
            if (minuteText.length === 1) commit(now().hour ?? 0, Number(minuteText));
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="--"
          placeholderTextColor={placeholder}
          style={segment}
        />,
      )}
      {twelve ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pm ? "PM, switch to AM" : "AM, switch to PM"}
          onPress={() => {
            const { hour: h, minute: m } = now();
            if (h !== null) commit((h + 12) % 24, m ?? 0);
          }}
          hitSlop={4}
          style={({ pressed }) => [
            {
              minWidth: large ? 64 : 40,
              height: large ? 48 : 36,
              marginLeft: large ? SPACE.sm : 0,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: RADIUS.control,
              backgroundColor: large ? fill : undefined,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Label type={large ? "title3" : "body"}>{pm ? "PM" : "AM"}</Label>
        </Pressable>
      ) : null}
    </View>
  );
}
