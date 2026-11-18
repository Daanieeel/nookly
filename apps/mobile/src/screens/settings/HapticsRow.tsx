import { Switch, View } from "react-native";
import { usePreference } from "../../data/preferences.ts";
import { Label } from "../../ui/kit/Label.tsx";
import { useScheme } from "../../ui/kit/scheme.ts";
import { HAPTICS_PREFERENCE, haptic, hapticsPreference } from "../../ui/haptics.ts";
import { GUTTER, SPACE, TINT } from "../../ui/tokens.ts";

/// Haptics on or off for this phone, laid out like a Settings row.
export function HapticsRow() {
  const scheme = useScheme();
  const [on, setOn] = usePreference(HAPTICS_PREFERENCE, hapticsPreference, true);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: GUTTER,
        paddingVertical: SPACE.md - 2,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Label accessibilityRole="header">Haptics</Label>
        <Label type="footnote" color="secondaryLabel">
          A gentle tap you feel as you pick, flip, finish or move something.
        </Label>
      </View>
      <Switch
        accessibilityLabel="Haptics"
        value={on}
        onValueChange={(next) => {
          setOn(next);
          // Felt only when turned on: the setting is read as it plays.
          haptic("toggle");
        }}
        trackColor={{ true: TINT.green[scheme] }}
      />
    </View>
  );
}
