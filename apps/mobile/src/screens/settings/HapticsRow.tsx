import { Switch, View } from "react-native";
import { usePreference } from "../../data/preferences.ts";
import { ROW_DIVIDER } from "../../ui/Row.tsx";
import { Text } from "../../ui/Text.tsx";
import { cn } from "../../ui/classes.ts";
import { HAPTICS_PREFERENCE, haptic, hapticsPreference } from "../../ui/haptics.ts";
import { useTheme } from "../../ui/theme.ts";

/// Haptics on or off for this phone, laid out like a Settings row.
export function HapticsRow() {
  const theme = useTheme();
  const [on, setOn] = usePreference(HAPTICS_PREFERENCE, hapticsPreference, true);
  return (
    <View className={cn("gap-2 px-1 py-4", ROW_DIVIDER)}>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-medium" accessibilityRole="header">
          Haptics
        </Text>
        <Switch
          accessibilityLabel="Haptics"
          value={on}
          onValueChange={(next) => {
            setOn(next);
            // Felt only when turned on: the setting is read as it plays.
            haptic("toggle");
          }}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>
      <Text variant="small" tone="muted">
        A gentle tap you feel as you pick, flip, finish or move something.
      </Text>
    </View>
  );
}
