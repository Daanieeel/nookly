import { haptic } from "./haptics.ts";
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { SvgXml } from "react-native-svg";
import type { ButtonStatus } from "./Button.tsx";
import { Label } from "./kit/Label.tsx";
import { MOODLE_MARK } from "./moodle-mark.ts";
import { CORNER, RADIUS, SPACE, TINT } from "./tokens.ts";
import { AnimatedPressable, usePressScale } from "./press.ts";

/// The desktop's `BrandButton`: a large white button carrying another service's mark, for
/// signing in with it. It looks the same in both themes, as such buttons do everywhere.
const BRAND = { fill: "#ffffff", text: "#1c1c1c", border: "#e2e2e2" };

export function BrandButton({
  label,
  mark,
  status = "idle",
  errorLabel,
  onPress,
}: {
  label: string;
  /// The service's mark, drawn in its own colours.
  mark: ReactNode;
  status?: ButtonStatus;
  errorLabel?: string;
  onPress: () => void;
}) {
  const press = usePressScale();
  const shown = status === "error" ? (errorLabel ?? label) : label;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityState={{ busy: status === "pending" }}
      disabled={status === "pending"}
      onPress={() => {
        haptic("tap");
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      unstable_pressDelay={0}
      style={[
        CORNER,
        {
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE.sm + 2,
          paddingHorizontal: SPACE.xl,
          borderRadius: RADIUS.control,
          borderWidth: 1,
          borderColor: BRAND.border,
          backgroundColor: BRAND.fill,
          shadowColor: "#000000",
          shadowOpacity: 0.08,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
        },
        press.style,
      ]}
    >
      {status === "pending" ? <ActivityIndicator size="small" color={BRAND.text} /> : mark}
      <View pointerEvents="none">
        <Label
          type="body"
          weight="600"
          tint={status === "error" ? TINT.red.light : BRAND.text}
          numberOfLines={1}
        >
          {shown}
        </Label>
      </View>
    </AnimatedPressable>
  );
}

/// Moodle's own mark: the orange M under a mortar board, in its colours in both themes.
export function MoodleMark({ size = 26 }: { size?: number }) {
  return (
    <View testID="moodle-mark" accessibilityElementsHidden importantForAccessibility="no">
      <SvgXml xml={MOODLE_MARK} width={size} height={size} />
    </View>
  );
}
