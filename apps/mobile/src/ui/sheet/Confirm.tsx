import type { Icon as TablerIcon } from "@tabler/icons-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "../Button.tsx";
import { Field } from "../Field.tsx";
import { haptic } from "../haptics.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { useIsTablet } from "../pane.tsx";
import { SheetFooter, useSheet } from "./Sheet.tsx";

/// A choice that ends a confirmation: the dangerous one in red, one that is serious but not
/// a loss (Sign Out) in orange, a gentler one (Hide) `secondary`.
interface ConfirmAction {
  label: string;
  destructive?: boolean;
  warning?: boolean;
  onPress: () => void;
}

/// One short line of what happens, led by an icon.
export interface ConfirmPoint {
  icon: TablerIcon;
  text: string;
  tone?: "caution";
}

export interface Confirmation {
  /// What is affected, named: "Delete "Work" forever?".
  title: string;
  /// What happens to it, and whether it can be undone. Short lines (`points`) read better
  /// than a paragraph.
  description?: string;
  points?: ConfirmPoint[];
  actions: ConfirmAction[];
  /// How much goes, as the desktop counts it: "12 Items".
  stats?: { value: number; label: string }[];
  /// A word to type before anything destructive can be pressed (the Space's name), so it
  /// is never a rushed tap.
  phrase?: string;
}

/// Whether `typed` is the phrase, ignoring case and spaces around it, as on the desktop.
function matchesPhrase(typed: string, phrase: string): boolean {
  return typed.trim().toLowerCase() === phrase.trim().toLowerCase();
}

/// Short statements, each with its icon: what a sheet says in place of a paragraph.
export function Points({ points }: { points: ConfirmPoint[] }) {
  const theme = useTheme();
  return (
    <View className="gap-3">
      {points.map((point) => {
        const Icon = point.icon;
        const color =
          point.tone === "caution" ? theme.colors.caution : theme.colors.mutedForeground;
        return (
          <View key={point.text} className="flex-row items-center gap-3">
            <Icon size={20} color={color} />
            <Text className="flex-1" tone={point.tone === "caution" ? "caution" : undefined}>
              {point.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/// A confirmation's buttons: what it does, then the way back, named `cancel`. On a tablet
/// the desktop's dialog footer (the way back first, at the bottom right), on a phone full
/// width with the way back last.
export function ConfirmButtons({
  cancel = "Cancel",
  children,
}: {
  cancel?: string;
  children: ReactNode;
}) {
  const sheet = useSheet();
  const tablet = useIsTablet();
  const back = (
    <Button
      label={cancel}
      variant="ghost"
      size={tablet ? "default" : "lg"}
      onPress={() => sheet?.close()}
    />
  );
  if (!tablet) {
    return (
      <View className="gap-3">
        {children}
        {back}
      </View>
    );
  }
  return (
    <SheetFooter>
      <View className="flex-row flex-wrap justify-end gap-2">
        {back}
        {children}
      </View>
    </SheetFooter>
  );
}

/// The desktop's `ConfirmPermanentDialog` as a sheet's content: what happens, then the
/// actions full width, the dangerous one kept apart from Cancel.
export function ConfirmContent({ confirmation }: { confirmation: Confirmation }) {
  const sheet = useSheet();
  const [typed, setTyped] = useState("");
  const { phrase, stats = [] } = confirmation;
  const locked = phrase !== undefined && !matchesPhrase(typed, phrase);
  const tablet = useIsTablet();
  // A warning as something that cannot be taken back, or needs care, opens.
  const risky = confirmation.actions.some((action) => action.destructive || action.warning);
  useEffect(() => {
    if (risky) haptic("warning");
  }, [risky]);
  const buttons = confirmation.actions.map((action) => (
    <Button
      key={action.label}
      label={action.label}
      variant={action.destructive ? "destructive" : action.warning ? "warning" : "secondary"}
      size={tablet ? "default" : "lg"}
      disabled={action.destructive === true && locked}
      onPress={() => sheet?.close(action.onPress)}
    />
  ));
  return (
    <View className="gap-5">
      {confirmation.description ? <Text tone="muted">{confirmation.description}</Text> : null}
      {confirmation.points ? <Points points={confirmation.points} /> : null}
      {stats.length > 0 ? (
        <View className="flex-row gap-6">
          {stats.map((stat) => (
            <Text key={stat.label} className="font-semibold">
              {`${stat.value} ${stat.label}`}
            </Text>
          ))}
        </View>
      ) : null}
      {phrase !== undefined ? (
        <Field
          label={`Type ${phrase} to confirm`}
          placeholder={phrase}
          autoCapitalize="none"
          autoCorrect={false}
          value={typed}
          onChangeText={setTyped}
        />
      ) : null}
      <ConfirmButtons>{buttons}</ConfirmButtons>
    </View>
  );
}
