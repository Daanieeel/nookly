import { IconCalendarEvent, IconX } from "@tabler/icons-react-native";
import { View } from "react-native";
import { localDay } from "../../screens/dates.ts";
import { haptic } from "../haptics.ts";
import { GroupedSection, INSET } from "../kit/GroupedSection.tsx";
import { IconBadge } from "../kit/IconBadge.tsx";
import { ListRow } from "../kit/ListRow.tsx";
import { SPACE } from "../tokens.ts";
import { CalendarPanel } from "./CalendarPanel.tsx";
import { useSheet } from "./Sheet.tsx";

/// A day picked in a sheet, as the desktop's `DateInput` popover: its calendar, then a
/// line with the quick picks (Today, Tomorrow) and Clear. Picking closes the sheet, unless
/// `then` continues on another step (a time after the day).
export function DayPicker({
  label,
  value,
  onChange,
  quick = [],
  clearable = true,
  then,
}: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  quick?: { label: string; value: string }[];
  clearable?: boolean;
  then?: (day: string) => void;
}) {
  const sheet = useSheet();
  const choose = (day: string | null) => {
    if (day !== value) onChange(day);
    if (day !== null && then) then(day);
    else sheet?.close();
  };
  const today = localDay();
  return (
    <View style={{ gap: SPACE.lg }}>
      <CalendarPanel value={value} onSelect={choose} />
      {quick.length > 0 || (clearable && value) ? (
        <GroupedSection margin={0} inset={INSET.badge}>
          {[
            ...quick.map((q) => (
              <ListRow
                key={q.label}
                badge={
                  <IconBadge glyph={IconCalendarEvent} tint={q.value === today ? "blue" : "gray"} />
                }
                title={q.label}
                detail={shortDate(q.value)}
                accessory="check"
                selected={q.value === value}
                onPress={() => {
                  haptic("select");
                  choose(q.value);
                }}
              />
            )),
            ...(clearable && value
              ? [
                  <ListRow
                    key="clear"
                    badge={<IconBadge glyph={IconX} tint="red" />}
                    title={`Clear ${label}`}
                    destructive
                    onPress={() => choose(null)}
                  />,
                ]
              : []),
          ]}
        </GroupedSection>
      ) : null}
    </View>
  );
}

/// A day as a quick pick's detail: its weekday and date, which its name ("Tomorrow") leaves out.
function shortDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
