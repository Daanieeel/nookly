import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Grid } from "../ui/Grid.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { Label } from "../ui/kit/Label.tsx";
import { type BadgeLook, MODULE_BADGES } from "../ui/kit/badges.ts";
import { RowsCard } from "../ui/kit/Surface.tsx";
import { CountTile, Tile } from "../ui/kit/Tile.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SPACE } from "../ui/tokens.ts";
import { AgendaRow } from "./CalendarScreen.tsx";
import { useCalendarColors } from "./calendar-colors.ts";
import { DashboardGreeting } from "./DashboardBriefing.tsx";
import { AssignmentsPanel, DecksPanel, JotsPanel, TasksPanel } from "./DashboardPanels.tsx";
import type { Dashboard } from "./DashboardScreen.tsx";
import { dueText } from "./dashboard-model.ts";
import { itemHref } from "./ExternalEventScreen.tsx";
import { type UpNext, untilText, upNext } from "./home-model.ts";

/// Deadlines Home lists before the rest wait in their lists.
const HOME_LIMIT = 4;

/// A module's icon on Home, all in one quiet tint so the page does not turn into a paint box.
const quiet = (badge: BadgeLook): BadgeLook => ({ ...badge, tint: "gray" });

/// The time now as "HH:MM", moving on with the clock so what is up next stays true.
function useClock(): string {
  const read = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };
  const [time, setTime] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setTime(read()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

/// The phone's Home: the sentence about the day with the mascot in it, what is on now or
/// next, tiles counting what waits (each opening its list), the calendar and the deadlines
/// coming up, then the desktop's panels with their tabs: tasks, assignments, cards and jots.
export function HomeScreen({ d }: { d: Dashboard }) {
  const router = useRouter();
  const time = useClock();
  const next = upNext(d.items, d.today, time);
  const overdue = d.dueTasks.filter((t) => (t.dueDate ?? "").slice(0, 10) < d.today).length;
  const week = d.deadlines.filter((x) => x.kind === "assignment").length;
  const cards = d.readyDecks.reduce((n, x) => n + x.stats.due + x.stats.learning + x.stats.new, 0);
  const spaceOf = (id: string) => d.spaces.find((s) => s.id === id);
  const spaces = d.spaces.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const openDecks = () => {
    const only = d.readyDecks.length === 1 ? d.readyDecks[0] : null;
    if (only) router.push(`/study/${only.entity.id}`);
    else
      d.open({ kind: "list", list: "decks", spaceIds: d.readyDecks.map((x) => x.entity.spaceId) });
  };
  const counts = [
    <CountTile
      key="tasks"
      {...quiet(MODULE_BADGES.tasks)}
      title="Tasks"
      count={d.dueTasks.length}
      detail={overdue > 0 ? `${overdue} overdue` : d.dueTasks.length > 0 ? "Due today" : "All done"}
      onPress={() => router.push("/tasks")}
    />,
    ...(d.assignments.length > 0
      ? [
          <CountTile
            key="assignments"
            {...quiet(MODULE_BADGES.assignments)}
            title="Assignments"
            count={week}
            detail="Due in two weeks"
            onPress={() => router.push("/assignments")}
          />,
        ]
      : []),
    ...(d.decks.length > 0
      ? [
          <CountTile
            key="decks"
            {...quiet(MODULE_BADGES.decks)}
            title="Cards"
            count={cards}
            detail={cards > 0 ? "To learn today" : "All caught up"}
            onPress={openDecks}
          />,
        ]
      : []),
    <CountTile
      key="jots"
      {...quiet(MODULE_BADGES.jots)}
      title="Jots"
      count={d.jots.length}
      detail="To be refined"
      onPress={() =>
        d.open({ kind: "list", list: "jots", spaceIds: d.jots.map((j) => j.entity.spaceId) })
      }
    />,
  ];
  // Two to a row: an odd one out would leave a hole, which the calendar's tile fills.
  if (counts.length % 2 === 1) {
    counts.push(
      <CountTile
        key="calendar"
        {...quiet(MODULE_BADGES.calendar)}
        title="Calendar"
        count={d.items.length}
        detail={d.items.length > 0 ? "On today" : "Nothing today"}
        onPress={() => router.push("/calendar")}
      />,
    );
  }
  return (
    <Screen onRefresh={d.onRefresh} refreshing={d.refreshing}>
      <DashboardGreeting briefing={d.briefing} open={d.open} compact />
      {next ? <UpNextCard next={next} color={spaceOf(next.item.spaceId)?.color} /> : null}
      <Section title="At a glance">
        <Grid min={150} max={2}>
          {counts}
        </Grid>
      </Section>
      <Section title="Today">
        <RowsCard>
          {d.items.length === 0 ? (
            <Empty text="Nothing on the calendar today." />
          ) : (
            d.items.map((item) => (
              <View key={item.id}>
                <AgendaRow item={item} color={d.colorOf(item.spaceId)} />
              </View>
            ))
          )}
        </RowsCard>
      </Section>
      {d.deadlines.length > 0 ? (
        <Section title="Coming up">
          <RowsCard>
            {d.deadlines.slice(0, HOME_LIMIT).map((x) => {
              const due = dueText(x.date, d.today);
              return (
                <Row
                  key={x.id}
                  title={x.title || "Untitled"}
                  subtitle={`${x.kind === "exam" ? "Exam" : "Assignment"}, ${due.text}`}
                  icon={
                    <IconBadge
                      {...quiet(MODULE_BADGES[x.kind === "exam" ? "exams" : "assignments"])}
                    />
                  }
                  onPress={() => router.push(`/entity/${x.id}`)}
                />
              );
            })}
          </RowsCard>
        </Section>
      ) : null}
      <TasksPanel tasks={d.tasks} statuses={d.statuses} spaces={spaces} today={d.today} />
      <AssignmentsPanel
        assignments={d.assignments}
        spaces={spaces}
        courseName={d.courseName}
        today={d.today}
      />
      <DecksPanel title="Cards" decks={d.decks} examName={d.examName} />
      <JotsPanel jots={d.jots} spaces={spaces} />
    </Screen>
  );
}

/// What is on now or next today, as a widget: the item's colour down its side, its name,
/// when and where, and how long until it or how long is left.
function UpNextCard({ next, color }: { next: UpNext; color?: string }) {
  const router = useRouter();
  const colors = useCalendarColors();
  const { item } = next;
  const accent = colors.accent(item.kind, color);
  const when = [item.startTime, item.endTime].filter(Boolean).join(" to ");
  const title = item.title || (item.kind === "session" ? "Session" : "Untitled");
  const until = untilText(next);
  return (
    <Tile
      accessibilityLabel={`${next.now ? "Now" : "Up next"}: ${title}, ${when}, ${until}`}
      // SAFETY: `itemHref` gives an entity's page or the calendar event sheet, both routes.
      onPress={() => router.push(itemHref(item.id) as never)}
    >
      <View style={{ flexDirection: "row", gap: SPACE.md }}>
        <View style={{ width: 4, borderRadius: 2, backgroundColor: accent }} />
        <View style={{ flex: 1, gap: SPACE.xxs }}>
          <View style={{ flexDirection: "row", gap: SPACE.sm }}>
            <Label type="footnote" weight="600" tint={accent} style={{ flex: 1 }}>
              {next.now ? "NOW" : "UP NEXT"}
            </Label>
            <Label type="footnote" weight="500" color="secondaryLabel">
              {until}
            </Label>
          </View>
          <Label type="headline" numberOfLines={2}>
            {title}
          </Label>
          <Label type="subheadline" color="secondaryLabel" numberOfLines={1}>
            {[when, item.location].filter(Boolean).join(", ")}
          </Label>
        </View>
      </View>
    </Tile>
  );
}
