import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "./theme.ts";

/// A small ring that fills as `value` goes from 0 to 1, as the desktop's progress circle.
export function ProgressRing({ value, size = 16 }: { value: number; size?: number }) {
  const theme = useTheme();
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(filled * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.mutedForeground}
          strokeOpacity={0.35}
          strokeWidth={stroke}
          fill="none"
        />
        {filled > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * filled} ${circumference}`}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        ) : null}
      </Svg>
    </View>
  );
}
