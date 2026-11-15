import { useState } from "react";
import { View } from "react-native";
import { Button } from "../Button.tsx";
import { Field } from "../Field.tsx";
import { Text } from "../Text.tsx";
import { useIsTablet } from "../pane.tsx";
import { SheetFooter, useSheet } from "./Sheet.tsx";

/// A choice that ends a confirmation: the dangerous one in red, a gentler one (Hide)
/// `secondary`.
interface ConfirmAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface Confirmation {
  /// What is affected, named: "Delete "Work" forever?".
  title: string;
  /// What happens to it, and whether it can be undone.
  description: string;
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

/// The desktop's `ConfirmPermanentDialog` as a sheet's content: what happens, then the
/// actions full width, the dangerous one kept apart from Cancel.
export function ConfirmContent({ confirmation }: { confirmation: Confirmation }) {
  const sheet = useSheet();
  const [typed, setTyped] = useState("");
  const { phrase, stats = [] } = confirmation;
  const locked = phrase !== undefined && !matchesPhrase(typed, phrase);
  const tablet = useIsTablet();
  const buttons = confirmation.actions.map((action) => (
    <Button
      key={action.label}
      label={action.label}
      variant={action.destructive ? "destructive" : "secondary"}
      size={tablet ? "default" : "lg"}
      disabled={action.destructive === true && locked}
      onPress={() => sheet?.close(action.onPress)}
    />
  ));
  return (
    <View className="gap-5">
      <Text tone="muted">{confirmation.description}</Text>
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
      {tablet ? (
        // The desktop's dialog footer: Cancel, then the actions, at the bottom right.
        <SheetFooter>
          <View className="flex-row flex-wrap justify-end gap-2">
            <Button label="Cancel" variant="ghost" onPress={() => sheet?.close()} />
            {buttons}
          </View>
        </SheetFooter>
      ) : (
        <View className="gap-3">
          {buttons}
          <Button label="Cancel" variant="ghost" size="lg" onPress={() => sheet?.close()} />
        </View>
      )}
    </View>
  );
}
