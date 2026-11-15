import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "../ui/Button.tsx";
import { Grid } from "../ui/Grid.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { Label } from "../ui/kit/Label.tsx";
import { MODULE_BADGES } from "../ui/kit/badges.ts";
import { RowsCard } from "../ui/kit/Surface.tsx";
import { ActionTile, CountTile, Tile } from "../ui/kit/Tile.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SPACE } from "../ui/tokens.ts";
import { AgendaRow } from "./CalendarScreen.tsx";
import { useCalendarColors } from "./calendar-colors.ts";
import { DashboardGreeting } from "./DashboardBriefing.tsx";
import type { Dashboard } from "./DashboardScreen.tsx";
import { dueText } from "./dashboard-model.ts";
import { itemHref } from "./ExternalEventScreen.tsx";
import { type UpNext, untilText, upNext } from "./home-model.ts";
import { SpaceIcon } from "./SpaceIcon.tsx";
import { TaskRow } from "./TaskRow.tsx";

/// Rows a list of Home shows before "View All".
const HOME_LIMIT = 4;

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

/// The phone's Home: a page of shortcuts rather than the desktop's panels. The sentence about
/// the day, what is on now or next, one tap to make a task, a jot, an entry or a bookmark,
/// tiles counting what waits (each opening its list), today's tasks to tick off, the
/// calendar, the deadlines coming up and every Space a tap away.
export function HomeScreen({ d }: { d: Dashboard }) {
  const router = useRouter();
  const time = useClock();
  const next = upNext(d.items, d.today, time);
  const overdue = d.dueTasks.filter((t) => (t.dueDate ?? "").slice(0, 10) < d.today).length;
  const week = d.deadlines.filter((x) => x.kind === "assignment").length;
  const cards = d.readyDecks.reduce((n, x) => n + x.stats.due + x.stats.learning + x.stats.new, 0);
  const spaceOf = (id: string) => d.spaces.find((s) => s.id === id);
  const openDecks = () => {
    const only = d.readyDecks.length === 1 ? d.readyDecks[0] : null;
    if (only) router.push(`/study/${only.entity.id}`);
    else
      d.open({ kind: "list", list: "decks", spaceIds: d.readyDecks.map((x) => x.entity.spaceId) });
  };
  const counts = [
    <CountTile
      key="tasks"
      {...MODULE_BADGES.tasks}
      title="Tasks"
      count={d.dueTasks.length}
      detail={overdue > 0 ? `${overdue} overdue` : d.dueTasks.length > 0 ? "Due today" : "All done"}
      onPress={() => router.push("/tasks")}
    />,
    ...(d.assignments.length > 0
      ? [
          <CountTile
            key="assignments"
            {...MODULE_BADGES.assignments}
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
            {...MODULE_BADGES.decks}
            title="Cards"
            count={cards}
            detail={cards > 0 ? "To learn today" : "All caught up"}
            onPress={openDecks}
          />,
        ]
      : []),
    <CountTile
      key="jots"
      {...MODULE_BADGES.jots}
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
        {...MODULE_BADGES.calendar}
        title="Calendar"
        count={d.items.length}
        detail={d.items.length > 0 ? "On today" : "Nothing today"}
        onPress={() => router.push("/calendar")}
      />,
    );
  }
  return (
    <Screen grouped onRefresh={d.onRefresh} refreshing={d.refreshing}>
      <DashboardGreeting
        date={d.date}
        offline={d.offline}
        briefing={d.briefing}
        open={d.open}
        compact
      />
      {next ? <UpNextCard next={next} color={spaceOf(next.item.spaceId)?.color} /> : null}
      <Section title="Create">
        <View style={{ flexDirection: "row", gap: SPACE.sm }}>
          <ActionTile
            {...MODULE_BADGES.tasks}
            label="Task"
            accessibilityLabel="New Task"
            onPress={() => router.push("/new/task")}
          />
          <ActionTile
            {...MODULE_BADGES.jots}
            label="Jot"
            accessibilityLabel="Quick Jot"
            onPress={() => router.push("/new/jot")}
          />
          <ActionTile
            {...MODULE_BADGES.calendar}
            label="Entry"
            accessibilityLabel="New Calendar Entry"
            onPress={() => router.push("/new/entry")}
          />
          <ActionTile
            {...MODULE_BADGES.bookmarks}
            label="Bookmark"
            accessibilityLabel="New Bookmark"
            onPress={() => router.push("/new/bookmark")}
          />
        </View>
      </Section>
      <Section title="At a glance">
        <Grid min={150} max={2}>
          {counts}
        </Grid>
      </Section>
      <Section
        title="Tasks for today"
        action={
          d.dueTasks.length > HOME_LIMIT ? (
            <Button
              label="View All"
              variant="ghost"
              size="sm"
              onPress={() => router.push("/tasks")}
            />
          ) : null
        }
      >
        <RowsCard>
          {d.dueTasks.length === 0 ? (
            <Empty text="Nothing due today. Enjoy the calm." />
          ) : (
            d.dueTasks
              .slice(0, HOME_LIMIT)
              .map((task) => (
                <TaskRow
                  key={task.entity.id}
                  task={task}
                  statuses={d.statuses}
                  spaceColor={spaceOf(task.entity.spaceId)?.color}
                  spaceName={spaceOf(task.entity.spaceId)?.name}
                />
              ))
          )}
        </RowsCard>
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
                    <IconBadge {...MODULE_BADGES[x.kind === "exam" ? "exams" : "assignments"]} />
                  }
                  onPress={() => router.push(`/entity/${x.id}`)}
                />
              );
            })}
          </RowsCard>
        </Section>
      ) : null}
      {d.spaces.length > 0 ? (
        <Section title="Spaces">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SPACE.sm }}
          >
            {d.spaces.map((space) => (
              <View key={space.id} style={{ width: 104 }}>
                <Tile
                  accessibilityLabel={space.name}
                  onPress={() => router.push(`/space/${space.id}`)}
                >
                  <View style={{ gap: SPACE.sm }}>
                    <IconBadge tint={space.color} icon={<SpaceIcon space={space} size={17} />} />
                    <Label type="subheadline" weight="500" numberOfLines={1}>
                      {space.name}
                    </Label>
                  </View>
                </Tile>
              </View>
            ))}
          </ScrollView>
        </Section>
      ) : null}
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
