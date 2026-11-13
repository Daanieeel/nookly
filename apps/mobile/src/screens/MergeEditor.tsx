import { type ConflictView, type DiffLine, combinedText, diffLines } from "@nookly/shared/sync";
import { IconAlertTriangle, IconCheck, IconGitCompare } from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { GroupedSection, INSET } from "../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { ListRow } from "../ui/kit/ListRow.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { cn } from "../ui/classes.ts";
import { usePaneWidth } from "../ui/pane.tsx";
import { useTheme } from "../ui/theme.ts";

/// The width from which the two versions sit side by side; below it they stack.
const SIDE_BY_SIDE = 700;

/// "Today, 14:02", "Yesterday, 14:02", or a date.
function when(at: Date | null): string {
  if (!at) return "";
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  if (at.toDateString() === now.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (at.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

const show = (value: ConflictView["current"]) =>
  value === null || value === "" ? "Empty" : String(value);

/// A color with transparency added, when it is a hex color the phone can add it to.
const alpha = (color: string, hex: string) =>
  /^#[0-9a-f]{6}$/i.test(color) ? `${color}${hex}` : color;

/// Who made a version and when, as the key above the lines: red for the other version,
/// green for the one showing now, as a code review tool marks them. Each key reads the
/// whole version to a screen reader.
function Legend({ view, which }: { view: ConflictView; which: "current" | "other" }) {
  const theme = useTheme();
  const side = which === "current" ? view.currentSide : view.otherSide;
  const value = which === "current" ? view.current : view.other;
  const color = which === "current" ? theme.colors.positive : theme.colors.destructive;
  return (
    <View
      accessible
      accessibilityLabel={`${side.device}'s version: ${show(value)}`}
      className="flex-row flex-wrap items-center gap-1.5 px-3 py-2"
    >
      <View className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <Text className="font-medium">{side.device}</Text>
      {side.isThisDevice ? <Badge label="This device" variant="primary" size="sm" /> : null}
      {which === "current" ? <Badge label="Showing now" size="sm" /> : null}
      {side.at ? (
        <Text variant="small" tone="muted" className="ml-auto">
          {when(side.at)}
        </Text>
      ) : null}
    </View>
  );
}

/// One line of the unified view: both sides' line numbers, the marker, and the text
/// with the words that differ marked.
function Line({
  line,
  which,
  numbers,
}: {
  line: DiffLine;
  which: "current" | "other" | "same";
  numbers: [number | null, number | null];
}) {
  const theme = useTheme();
  const color =
    which === "current"
      ? theme.colors.positive
      : which === "other"
        ? theme.colors.destructive
        : null;
  return (
    <View className="flex-row" style={color ? { backgroundColor: alpha(color, "1a") } : undefined}>
      {numbers.map((number, index) => (
        <Text
          // Two fixed columns: the other version's number, then this one's.
          key={index === 0 ? "other" : "current"}
          variant="small"
          tone="muted"
          className="w-8 pr-1.5 text-right font-mono"
          style={color ? { backgroundColor: alpha(color, "14") } : undefined}
        >
          {number ?? ""}
        </Text>
      ))}
      <Text variant="small" tone="muted" className="w-5 text-center font-mono">
        {which === "current" ? "+" : which === "other" ? "\u2212" : ""}
      </Text>
      <Text variant="small" className="flex-1 py-0.5 pr-3 font-mono">
        {line.segments.map((segment, index) => (
          <Text
            // The text is the same on every render, so its place is its identity.
            key={`${index}-${segment.text}`}
            variant="small"
            className="font-mono"
            style={segment.changed && color ? { backgroundColor: alpha(color, "59") } : undefined}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/// Both versions as one list of lines, the way a code review tool shows a change on a
/// narrow screen: lines both share once, and where they differ the other version's line
/// in red above the line showing now in green.
function UnifiedView({ view }: { view: ConflictView }) {
  const rows = diffLines(show(view.other), show(view.current));
  return (
    <View className="overflow-hidden rounded-lg border border-border bg-card">
      <View className="border-b border-border bg-muted">
        <Legend view={view} which="other" />
        <Legend view={view} which="current" />
      </View>
      <View className="py-1">
        {rows.flatMap((row, index) => {
          if (row.kind === "same" && row.left && row.right) {
            return [
              <Line
                key={`${index}-same`}
                line={row.left}
                which="same"
                numbers={[row.left.number, row.right.number]}
              />,
            ];
          }
          return [
            row.left ? (
              <Line
                key={`${index}-other`}
                line={row.left}
                which="other"
                numbers={[row.left.number, null]}
              />
            ) : null,
            row.right ? (
              <Line
                key={`${index}-current`}
                line={row.right}
                which="current"
                numbers={[null, row.right.number]}
              />
            ) : null,
          ];
        })}
      </View>
    </View>
  );
}

/// One side of a split row: the line number and the text, or an empty, shaded cell where
/// this side has no line.
function SplitCell({
  line,
  which,
  changed,
}: {
  line: DiffLine | null;
  which: "current" | "other";
  changed: boolean;
}) {
  const theme = useTheme();
  const color = which === "current" ? theme.colors.positive : theme.colors.destructive;
  const edge = which === "other" ? "border-r border-border" : "";
  if (!line) {
    return (
      <View
        className={cn("flex-1", edge)}
        style={{ backgroundColor: alpha(theme.colors.mutedForeground, "1f") }}
      />
    );
  }
  return (
    <View
      className={cn("flex-1 flex-row", edge)}
      style={changed ? { backgroundColor: alpha(color, "1a") } : undefined}
    >
      <Text
        variant="small"
        tone="muted"
        className="w-8 pr-1.5 text-right font-mono"
        style={changed ? { backgroundColor: alpha(color, "14") } : undefined}
      >
        {line.number}
      </Text>
      <Text variant="small" tone="muted" className="w-5 text-center font-mono">
        {changed ? (which === "current" ? "+" : "\u2212") : ""}
      </Text>
      <Text variant="small" className="flex-1 py-0.5 pr-3 font-mono">
        {line.segments.map((segment, index) => (
          <Text
            // The text is the same on every render, so its place is its identity.
            key={`${index}-${segment.text}`}
            variant="small"
            className="font-mono"
            style={segment.changed && changed ? { backgroundColor: alpha(color, "59") } : undefined}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/// Both versions side by side on a wide iPad, as on the desktop: the other version on the
/// left in red, the one showing now on the right in green, each row level on both sides.
function SplitView({ view }: { view: ConflictView }) {
  const rows = diffLines(show(view.other), show(view.current));
  return (
    <View className="overflow-hidden rounded-lg border border-border bg-card">
      <View className="flex-row border-b border-border bg-muted">
        <View className="flex-1 border-r border-border">
          <Legend view={view} which="other" />
        </View>
        <View className="flex-1">
          <Legend view={view} which="current" />
        </View>
      </View>
      {rows.map((row, index) => (
        // Rows are the diff's own order and never move.
        <View key={`${index}-${row.kind}`} className="flex-row">
          <SplitCell line={row.left} which="other" changed={row.kind === "changed"} />
          <SplitCell line={row.right} which="current" changed={row.kind === "changed"} />
        </View>
      ))}
    </View>
  );
}

function Detail({ view, onDone }: { view: ConflictView; onDone: () => void }) {
  const theme = useTheme();
  const { sync } = useAppData();
  const width = usePaneWidth();
  const [combined, setCombined] = useState<string | null>(null);
  useEffect(() => setCombined(null), [view.id]);
  const decide = useMutation({
    mutationFn: (choice: Parameters<typeof sync.resolveConflict>[1]) =>
      sync.resolveConflict(view, choice),
    onSuccess: onDone,
  });
  const text = view.isText && view.kind === "field";
  const both = () =>
    combinedText(
      view.current === null ? "" : String(view.current),
      view.other === null ? "" : String(view.other),
      view.field,
    );

  if (view.kind === "removed") {
    return (
      <View className="gap-3">
        <View className="flex-row items-start gap-2">
          <IconAlertTriangle size={16} className="mt-0.5" color={theme.colors.caution} />
          <Text className="flex-1">
            This was removed on one device and changed on another. Nothing was deleted: you can
            bring it back.
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            label="Bring It Back"
            status={statusOf(decide)}
            errorLabel="Couldn't bring it back"
            onPress={() => decide.mutate("other")}
          />
          <Button
            label="Keep It Removed"
            variant="secondary"
            onPress={() => decide.mutate("current")}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {width >= SIDE_BY_SIDE ? <SplitView view={view} /> : <UnifiedView view={view} />}
      {combined === null ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            label="Keep This One"
            status={statusOf(decide)}
            errorLabel="Couldn't save it"
            onPress={() => decide.mutate("current")}
          />
          <Button
            label="Keep the Other"
            variant="secondary"
            onPress={() => decide.mutate("other")}
          />
          {text ? (
            <>
              <Button label="Keep Both" variant="secondary" onPress={() => setCombined(both())} />
              <Button
                label="Edit Combined Version"
                variant="ghost"
                onPress={() => setCombined(both())}
              />
            </>
          ) : null}
        </View>
      ) : (
        <View className="gap-2">
          <Field label="Combined version" multiline value={combined} onChangeText={setCombined} />
          <View className="flex-row gap-2">
            <Button
              label="Save Combined"
              status={statusOf(decide)}
              errorLabel="Couldn't save it"
              onPress={() => decide.mutate({ value: combined })}
            />
            <Button label="Back" variant="ghost" onPress={() => setCombined(null)} />
          </View>
        </View>
      )}
      {decide.error ? <Text tone="destructive">{decide.error.message}</Text> : null}
    </View>
  );
}

/// The conflicts waiting for a decision, from this phone's log and the server's.
export function useConflictViews() {
  const { sync } = useAppData();
  return useQuery({
    queryKey: keys.sync.conflictItems,
    queryFn: () => sync.conflictViews(),
  });
}

/// Changes two devices disagreed about, and what to do with each: keep this one, keep
/// the other, keep both, or write a combined version. The two versions stack on a
/// phone and sit side by side on a tablet. Nothing is deleted: the version not chosen
/// stays in the log.
export function MergeEditor() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const width = usePaneWidth();
  const { data: views = [], isFetched } = useConflictViews();
  const [pick, setPick] = useState<string | null>(null);
  const wide = width >= SIDE_BY_SIDE + 300;
  const selected = views.find((v) => v.id === pick) ?? (wide ? views[0] : undefined);
  const refresh = () => {
    setPick(null);
    void queryClient.invalidateQueries({ queryKey: keys.sync.root });
    void queryClient.invalidateQueries({ queryKey: keys.local });
  };
  const list = (
    <GroupedSection margin={0} inset={INSET.badge}>
      {views.map((view) => (
        <ListRow
          key={view.id}
          badge={<IconBadge glyph={IconGitCompare} tint="yellow" />}
          title={view.itemTitle}
          subtitle={view.fieldLabel}
          accessory={wide ? "check" : "chevron"}
          selected={wide ? view.id === selected?.id : undefined}
          onPress={() => setPick(view.id)}
        />
      ))}
    </GroupedSection>
  );
  return (
    <Screen grouped>
      <Text tone="muted">
        Two of your devices changed the same thing. The newer change is showing, nothing was lost,
        and you can keep either, both, or a mix.
      </Text>
      {isFetched && views.length === 0 ? (
        <View className="flex-row items-center gap-2 py-6">
          <IconCheck size={16} color={theme.colors.positive} />
          <Text tone="muted">Nothing needs a look.</Text>
        </View>
      ) : wide ? (
        <View className="flex-row gap-4">
          <View className="w-64">{list}</View>
          <View className="flex-1">
            {selected ? <Detail key={selected.id} view={selected} onDone={refresh} /> : null}
          </View>
        </View>
      ) : selected ? (
        <View className="gap-3">
          <Button label="All Changes" variant="ghost" size="sm" onPress={() => setPick(null)} />
          <Text className="font-medium">
            {selected.itemTitle}
            <Text tone="muted">, {selected.fieldLabel}</Text>
          </Text>
          <Detail key={selected.id} view={selected} onDone={refresh} />
        </View>
      ) : (
        list
      )}
    </Screen>
  );
}
