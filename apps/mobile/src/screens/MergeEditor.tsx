import { type ConflictView, combinedText, diffWords } from "@nookly/shared/sync";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { ROW_DIVIDER, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { cn } from "../ui/classes.ts";
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

/// A color as a light wash behind text, when it is a hex color the phone can add
/// transparency to.
const wash = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}40` : color);

/// One version: who made it, when, and the text with the words that differ marked.
function Version({
  view,
  which,
  segments,
}: {
  view: ConflictView;
  which: "current" | "other";
  segments: { text: string; changed: boolean }[] | null;
}) {
  const theme = useTheme();
  const side = which === "current" ? view.currentSide : view.otherSide;
  const value = which === "current" ? view.current : view.other;
  return (
    <View
      accessible
      accessibilityLabel={`${side.device}'s version: ${show(value)}`}
      className="flex-1 gap-2 rounded-lg border border-border p-3"
    >
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="font-medium">{side.device}</Text>
        {side.isThisDevice ? <Badge label="This device" variant="primary" size="sm" /> : null}
        {which === "current" ? <Badge label="Showing now" size="sm" /> : null}
        {side.at ? (
          <Text variant="small" tone="muted" className="ml-auto">
            {when(side.at)}
          </Text>
        ) : null}
      </View>
      <Text>
        {segments
          ? segments.map((segment, index) => (
              <Text
                // The text is the same on every render, so its place is its identity.
                key={`${index}-${segment.text}`}
                className="rounded-sm"
                style={
                  segment.changed ? { backgroundColor: wash(theme.colors.caution) } : undefined
                }
              >
                {segment.text}
              </Text>
            ))
          : show(value)}
      </Text>
    </View>
  );
}

function Detail({ view, onDone }: { view: ConflictView; onDone: () => void }) {
  const { sync } = useAppData();
  const { width } = useWindowDimensions();
  const [combined, setCombined] = useState<string | null>(null);
  useEffect(() => setCombined(null), [view.id]);
  const decide = useMutation({
    mutationFn: (choice: Parameters<typeof sync.resolveConflict>[1]) =>
      sync.resolveConflict(view, choice),
    onSuccess: onDone,
  });
  const text = view.isText && view.kind === "field";
  const diff = text ? diffWords(show(view.current), show(view.other)) : null;
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
          <IconAlertTriangle size={16} className="mt-0.5" color="#f59e0b" />
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
      <View className={cn("gap-3", width >= SIDE_BY_SIDE && "flex-row")}>
        <Version view={view} which="current" segments={diff?.left ?? null} />
        <Version view={view} which="other" segments={diff?.right ?? null} />
      </View>
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
  const { width } = useWindowDimensions();
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
    <Section>
      {views.map((view) => (
        <Button
          key={view.id}
          label={`${view.itemTitle}, ${view.fieldLabel}`}
          variant={view.id === selected?.id ? "secondary" : "ghost"}
          className={cn("h-auto justify-start py-2", ROW_DIVIDER)}
          onPress={() => setPick(view.id)}
        />
      ))}
    </Section>
  );
  return (
    <Screen>
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
