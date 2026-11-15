import { useIsFocused, useRouter } from "expo-router";
// The runs inside the sentence are plain native text, so they take its size and font.
import { Text as Inline, View } from "react-native";
import { Mascot } from "../ui/Mascot.tsx";
import { Text } from "../ui/Text.tsx";
import { type Briefing, type LinkTarget, type Run } from "./briefing-runs.ts";

/// The Dashboard's sentence as large text, as the desktop draws it: the greeting and every
/// count, time and name in the text colour and bold, the words between them faded, so the
/// eye lands on what the day holds. Every count, time and name is tappable: it opens the
/// list or the item it speaks of.
export function DashboardBriefing({
  briefing,
  open,
  compact = false,
}: {
  briefing: Briefing;
  open: (target: LinkTarget) => void;
  /// A size smaller, for a phone's Home where the sentence leads a page of shortcuts.
  compact?: boolean;
}) {
  const glue = (text: string, key?: string) => (
    <Inline key={key} className={GLUE}>
      {text}
    </Inline>
  );
  const runs = (list: Run[], key: string) =>
    list.map((run, i) =>
      run.kind === "text" ? (
        // The runs are fixed in order for one sentence.
        // oxlint-disable-next-line react/no-array-index-key
        glue(run.text, `${key}-${i}`)
      ) : (
        <Inline
          // oxlint-disable-next-line react/no-array-index-key
          key={`${key}-${i}`}
          accessibilityRole="link"
          onPress={() => open(run.target)}
          className={run.kind === "token" ? TOKEN : NAME}
        >
          {run.text}
        </Inline>
      ),
    );
  return (
    <View accessibilityRole="header">
      <Text
        className={
          compact ? "text-xl leading-8 text-foreground" : "text-2xl leading-9 text-foreground"
        }
      >
        <Inline className="font-semibold text-foreground">
          {briefing.greeting}
          {briefing.mark}
        </Inline>{" "}
        {runs(briefing.lead, "lead")}
        {glue(briefing.bridge)}
        {briefing.clauses.map((clause, i) => (
          <Inline key={clause.key}>
            {i > 0 ? glue(briefing.connectors[i - 1]) : null}
            {clause.icon} {runs(clause.runs, clause.key)}
          </Inline>
        ))}
        {glue(".")}
      </Text>
    </View>
  );
}

/// The day the Dashboard greets, offline or not, and the desktop's corner mascot beside it,
/// over the sentence about the day.
export function DashboardGreeting({
  date,
  offline,
  briefing,
  open,
  compact = false,
}: {
  date: string;
  offline: boolean;
  briefing: Briefing;
  open: (target: LinkTarget) => void;
  compact?: boolean;
}) {
  const focused = useIsFocused();
  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-3">
        <Text variant="small" tone="muted" className="flex-1 pb-1">
          {date}
          {offline ? ". Offline, changes sync later." : ""}
        </Text>
        <Mascot size={compact ? 52 : 64} animate={focused} />
      </View>
      <DashboardBriefing briefing={briefing} open={open} compact={compact} />
    </View>
  );
}

/// The words between the counts, faded as on the desktop (`text-foreground/45`).
const GLUE = "text-foreground/45";
/// A count, time or day.
const TOKEN = "font-semibold text-foreground";
/// An item's name: bold on the accent surface, the desktop's pill as far as text allows.
const NAME = "bg-accent font-semibold text-foreground";

/// Where a link of the sentence goes.
export function useOpenTarget(firstSpace: string | undefined) {
  const router = useRouter();
  return (target: LinkTarget) => {
    if (target.kind === "entity") router.push(`/entity/${target.id}`);
    else if (target.kind === "overview") {
      router.push(target.view === "tasks" ? "/tasks" : "/assignments");
    } else {
      const space = target.spaceIds[0] ?? firstSpace;
      if (space) router.push(`/module/${space}/${target.list}`);
    }
  };
}
