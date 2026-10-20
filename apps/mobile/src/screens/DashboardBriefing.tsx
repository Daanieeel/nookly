import { useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "../ui/Text.tsx";
import { type Briefing, type LinkTarget, type Run } from "./briefing-runs.ts";

/// The Dashboard's sentence as large text, with every count, time and name tappable: it opens
/// the list or the item it speaks of.
export function DashboardBriefing({
  briefing,
  open,
}: {
  briefing: Briefing;
  open: (target: LinkTarget) => void;
}) {
  const runs = (list: Run[], key: string) =>
    list.map((run, i) =>
      run.kind === "text" ? (
        run.text
      ) : (
        <Text
          // The runs are fixed in order for one sentence.
          // oxlint-disable-next-line react/no-array-index-key
          key={`${key}-${i}`}
          accessibilityRole="link"
          onPress={() => open(run.target)}
          className={
            run.kind === "token"
              ? "font-semibold text-xl text-foreground"
              : "font-medium text-xl text-foreground underline"
          }
        >
          {run.text}
        </Text>
      ),
    );
  return (
    <View accessibilityRole="header" className="gap-1">
      <Text className="font-heading text-xl leading-8">
        {briefing.greeting}
        {briefing.mark} {runs(briefing.lead, "lead")}
        {briefing.bridge}
        {briefing.clauses.map((clause, i) => (
          <Text key={clause.key} className="font-heading text-xl">
            {i > 0 ? briefing.connectors[i - 1] : ""}
            {clause.icon} {runs(clause.runs, clause.key)}
          </Text>
        ))}
        .
      </Text>
    </View>
  );
}

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
