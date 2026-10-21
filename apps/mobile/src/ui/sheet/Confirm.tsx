import { View } from "react-native";
import { Button } from "../Button.tsx";
import { Text } from "../Text.tsx";
import { useSheet } from "./Sheet.tsx";

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
}

/// The desktop's `ConfirmPermanentDialog` as a sheet's content: what happens, then the
/// actions full width, the dangerous one kept apart from Cancel.
export function ConfirmContent({ confirmation }: { confirmation: Confirmation }) {
  const sheet = useSheet();
  return (
    <View className="gap-5">
      <Text tone="muted">{confirmation.description}</Text>
      <View className="gap-3">
        {confirmation.actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            variant={action.destructive ? "destructive" : "secondary"}
            size="lg"
            onPress={() => sheet?.close(action.onPress)}
          />
        ))}
        <Button label="Cancel" variant="ghost" size="lg" onPress={() => sheet?.close()} />
      </View>
    </View>
  );
}
