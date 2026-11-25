import { type MigrationState, migrationSummary } from "@nookly/shared/sync";
import { IconAlertTriangle, IconCircleCheck, IconCircleDashed } from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData, useSyncState } from "../data/context.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { SPACE, TINT } from "../ui/tokens.ts";
import { useScheme } from "../ui/kit/scheme.ts";
import { useIsTablet } from "../ui/pane.tsx";
import { useDeviceWord } from "../ui/device-word.ts";

/// The desktop's first sync page (`FirstSyncDialog.tsx`) on the phone: the backup, the items
/// and files going up, and the check with the server, over the whole app while it runs so
/// nothing else is done meanwhile and nothing looks closable. Done or Try Again at the end.

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

type StepState = "waiting" | "running" | "done" | "failed";

function steps(m: MigrationState) {
  const order = ["backup", "sending", "checking", "done"] as const;
  const at = m.phase === "failed" ? 0 : order.indexOf(m.phase);
  const state = (index: number): StepState => {
    if (m.phase === "failed") return index === 0 ? "failed" : "waiting";
    if (index < at || m.phase === "done") return "done";
    return index === at ? "running" : "waiting";
  };
  return { backup: state(0), sending: state(1), checking: state(2) };
}

function StepIcon({ state }: { state: StepState }) {
  const theme = useTheme();
  const scheme = useScheme();
  if (state === "done") return <IconCircleCheck size={20} color={TINT.green[scheme]} />;
  if (state === "failed") return <IconAlertTriangle size={20} color={TINT.red[scheme]} />;
  if (state === "running") return <ActivityIndicator size="small" />;
  return <IconCircleDashed size={20} color={theme.colors.mutedForeground} />;
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const track = useSemantic("fill");
  const scheme = useScheme();
  const share = max === 0 ? 1 : Math.min(1, value / max);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: track }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.round(share * 100)}%`,
          borderRadius: 3,
          backgroundColor: TINT.blue[scheme],
        }}
      />
    </View>
  );
}

function Step({
  state,
  title,
  detail,
  children,
}: {
  state: StepState;
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", gap: SPACE.md }}>
      <View style={{ width: 22, alignItems: "center", paddingTop: 1 }}>
        <StepIcon state={state} />
      </View>
      <View style={{ flex: 1, gap: SPACE.sm }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: SPACE.sm }}>
          <Text tone={state === "waiting" ? "muted" : "default"} className="flex-1">
            {title}
          </Text>
          {detail ? (
            <Text variant="small" tone="muted" className="tabular-nums">
              {detail}
            </Text>
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}

export function FirstSyncPage() {
  const { sync } = useAppData();
  const migration = useSyncState((state) => state.migration);
  const insets = useSafeAreaInsets();
  const background = useSemantic("background");
  // A tablet's is the desktop's first sync dialog: a card over the dimmed app.
  const tablet = useIsTablet();
  const device = useDeviceWord();
  const retry = useMutation({ mutationFn: () => sync.retryFirstSync() });
  const running = migration !== null && migration.phase !== "done" && migration.phase !== "failed";
  // Up as soon as it starts, and kept up until its end has been read.
  const [up, setUp] = useState(running);
  useEffect(() => {
    if (running) setUp(true);
  }, [running]);
  if (!migration || !(up || running)) return null;
  const state = steps(migration);
  const done = migration.phase === "done";
  const failed = migration.phase === "failed";
  return (
    <View
      accessibilityViewIsModal
      className={tablet ? "bg-black/40" : undefined}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: tablet ? undefined : background,
          paddingTop: insets.top + SPACE.xl,
          paddingBottom: insets.bottom + SPACE.lg,
          paddingHorizontal: SPACE.xl,
          justifyContent: "center",
          zIndex: 1000,
        },
      ]}
    >
      <View
        testID={tablet ? "first-sync-card" : undefined}
        className={tablet ? "rounded-xl border border-border bg-card shadow-md" : undefined}
        style={{
          gap: SPACE.xl,
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          padding: tablet ? SPACE.xl : 0,
        }}
      >
        <View style={{ gap: SPACE.sm }}>
          <Text variant="title" accessibilityRole="header">
            {`Bringing this ${device} into your account`}
          </Text>
          <Text tone="muted">
            Everything here goes into your account, and stays here too. Nookly is ready again when
            this is done.
          </Text>
        </View>
        <View style={{ gap: SPACE.lg }}>
          <Step
            state={state.backup}
            title={
              state.backup === "done" ? `Backed up this ${device}` : `Backing up this ${device}`
            }
          />
          <Step
            state={state.sending}
            title="Sending your items"
            detail={`${count(migration.itemsSent)} of ${plural(migration.items, "item", "items")}`}
          >
            <ProgressBar value={migration.itemsSent} max={migration.items} label="Items sent" />
          </Step>
          {migration.files > 0 ? (
            <Step
              state={state.sending}
              title="Sending your files"
              detail={`${count(migration.filesSent)} of ${plural(migration.files, "file", "files")}`}
            >
              <ProgressBar value={migration.filesSent} max={migration.files} label="Files sent" />
            </Step>
          ) : null}
          <Step state={state.checking} title="Checking with the server" />
        </View>
        {done ? (
          <View accessibilityLiveRegion="polite" style={{ gap: SPACE.xs }}>
            <Text>{migrationSummary(migration, `this ${device}`)}</Text>
            <Text variant="small" tone="muted">
              Nothing on this {device} was removed, and the backup from before stays where it is.
            </Text>
          </View>
        ) : null}
        {failed ? (
          <Text tone="destructive" accessibilityLiveRegion="assertive">
            {migration.error ?? "The first sync stopped."}
          </Text>
        ) : null}
        {done ? <Button label="Done" size="lg" onPress={() => setUp(false)} /> : null}
        {failed ? (
          <View style={{ gap: SPACE.sm }}>
            <Button
              label="Try Again"
              size="lg"
              status={statusOf(retry)}
              errorLabel="Couldn't start"
              onPress={() => retry.mutate()}
            />
            <Button label="Close" variant="ghost" size="lg" onPress={() => setUp(false)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
