import type { AgendaItem } from "@nookly/shared/data";
import { IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useAgenda, useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { IconButton } from "../ui/Button.tsx";
import { Empty, Row, Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { addDays, dayLabel, localDay } from "./dates.ts";
import { useSyncRefresh } from "./useSyncRefresh.ts";

const DAYS = 14;

export function AgendaRow({ item, color }: { item: AgendaItem; color?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const time = item.allDay
    ? "All day"
    : [item.startTime, item.endTime].filter(Boolean).join(" to ");
  return (
    <Row
      title={item.title || (item.kind === "session" ? "Session" : "Untitled")}
      subtitle={[time, item.location].filter(Boolean).join(", ")}
      icon={
        <View
          style={{
            width: 4,
            alignSelf: "stretch",
            borderRadius: 2,
            backgroundColor: color ?? theme.colors.border,
          }}
        />
      }
      trailing={color ? <SpaceDot color={color} /> : null}
      onPress={() => router.push(`/entity/${item.id}`)}
    />
  );
}

/// The next two weeks of every Space, day by day: Sessions and Calendar entries in
/// their Space's color, like the desktop's unified Calendar.
export function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = localDay();
  const last = addDays(today, DAYS - 1);
  const { data: items = [] } = useAgenda(today, last);
  const { data: spaces = [] } = useSpaces();
  const { refreshing, onRefresh } = useSyncRefresh();
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const onDay = (day: string) => items.filter((i) => i.date <= day && (i.endDate ?? i.date) >= day);
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
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        {items.length === 0 ? <Text tone="muted">Nothing in the next two weeks.</Text> : null}
        {days
          .filter((day) => onDay(day).length > 0 || day === today)
          .map((day) => (
            <Section key={day} title={dayLabel(day, today)}>
              {onDay(day).length === 0 ? (
                <Empty text="Nothing planned." />
              ) : (
                onDay(day).map((item, i) => (
                  <View key={`${item.id}-${day}`}>
                    {i > 0 ? <Separator /> : null}
                    <AgendaRow
                      item={item}
                      color={spaces.find((s) => s.id === item.spaceId)?.color}
                    />
                  </View>
                ))
              )}
            </Section>
          ))}
      </Screen>
    </>
  );
}
