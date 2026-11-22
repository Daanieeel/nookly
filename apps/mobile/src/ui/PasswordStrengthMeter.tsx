import { passwordStrength } from "@nookly/shared/password-strength";
import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// How hard `password` is to guess, in four bars and a word under the field it rates (the
/// desktop's `PasswordStrengthMeter`). It advises and never blocks: a weak password is the
/// person's to choose. Nothing shows while the field is empty.
export function PasswordStrengthMeter({
  password,
  userInputs = [],
}: {
  password: string;
  /// Words that make it easier to guess for whoever knows the person (name, email).
  userInputs?: readonly string[];
}) {
  const theme = useTheme();
  const inputs = userInputs.join("\n");
  const strength = useMemo(
    () => passwordStrength(password, inputs ? inputs.split("\n") : []),
    [password, inputs],
  );
  if (!strength) return null;
  const color =
    strength.score <= 1
      ? theme.colors.destructive
      : strength.score === 2
        ? theme.colors.caution
        : theme.colors.positive;
  const tone = strength.score <= 1 ? "destructive" : strength.score === 2 ? "caution" : "positive";
  const filled = Math.max(1, strength.score);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Password strength"
      accessibilityValue={{ min: 0, max: 4, now: strength.score, text: strength.label }}
      className="flex-row items-center gap-3"
    >
      <View className="flex-1 flex-row gap-1" importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4].map((bar) => (
          <View
            key={bar}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: bar <= filled ? color : theme.colors.border,
            }}
          />
        ))}
      </View>
      <Text variant="small" tone={tone} className="w-16 text-right font-medium">
        {strength.label}
      </Text>
    </View>
  );
}
